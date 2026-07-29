# Hinglish Query Fix — Execution Plan

> **Date**: 2026-07-29
> **Status**: Approved for implementation
> **Priority**: Critical — blocks core product functionality

---

## ⚠️ READ THIS FIRST — Findings from a later QA/audit session (2026-07-29, same day, after this plan was written)

While verifying an unrelated task (TASK-024 Hinglish-consistency), a full-suite golden-test run + live investigation turned up 3 things that **directly affect this plan**, especially **Change 3 (SafetyNet Threshold)** below. Read this section before starting Day 1.

### Finding 1 — Two small, unrelated bugs found and fixed (on a separate branch, NOT merged to main yet)

Branch: `fix/error-handling-and-golden-set-wip` (not merged — needs review/approval before merging).

1. **Validation errors were mislabeled as generic "provider_error"**: e.g. Focus Mode without a `chapterId` showed *"Kuch technical dikkat aa gayi"* instead of the actual, already-correct message *"Focus Mode ke liye chapterId dena zaroori hai."* Root cause: `askOrchestrator.js`'s pre-pipeline catch block only passed through `error.message` for statusCode 429/403, collapsing every other case (400, 404) into the generic fallback. Fix: pass through `error.message` for any `ApiError` with `statusCode < 500`. Unrelated to Hinglish retrieval, but worth merging alongside this plan since it touches the same "student sees a wrong/misleading message" theme.
2. **Golden-test `BS04`** (`"Iska kya matlab hai?"`) expected `EXPLAIN_MORE` but decider correctly returns `GREETING` — because the golden-set harness always uses a **fresh, history-less session** (`sessionId: randomUUID()` per query, confirmed in `run-golden-set.js`), and `deciderPrompt.js` (rule 1) explicitly says a topic-less pronoun with no resolvable context should be `GREETING`. This was a wrong test expectation, not a product bug. Fixed the expected value in `golden-queries.json`.

Neither of these is part of this plan's scope — flagging only because the golden-baseline file this plan's testing will rely on (`backend/test/golden-baseline-phase1.json`) was affected by both.

### Finding 2 — CRITICAL: This plan's "Change 3" (lower SafetyNet threshold 0.70 → 0.65) may make a *different*, newly-discovered false-positive worse

**What was found**: `"Hello Zuno"` (a pure greeting) now scores **0.736** on the SafetyNet academic-similarity probe (`intentSafetyNet.js` → `probeAcademicSimilarity`) — above the *current* 0.70 threshold — causing the decider's correct `GREETING` classification to be wrongly overridden to `CONCEPT_QUESTION`. Confirmed live via server logs:
```
[Step 4→5] intent: GREETING, needsRetrieval: false
[SafetyNet] GREETING → CONCEPT_QUESTION | score:0.736 | query:"Hello Zuno"
```
This was **not caused by any code change** — `intentSafetyNet.js` hasn't been touched since 27 June. Root cause: the `npm run rag:index` re-run (done for the separate TASK-024 Hinglish-consistency work, needed to add `hinglish_title` etc. to chunk metadata) **re-embedded all 629 chunks from scratch** via a live Gemini embedding API call. Verified the actual chapter *content* embedded is byte-identical before/after (frontmatter fields are stripped before embedding — checked `markdownLoader.js`'s `parseYamlFrontmatter`). The shift is instead a known characteristic of hosted embedding APIs: two separate calls for identical text are not guaranteed to produce bit-identical vectors (model versions can silently change server-side, and floating-point summation order can differ across calls) — this normally doesn't matter, but it can flip the outcome for a query sitting exactly on the threshold boundary, like this one.

**Why this matters for Change 3 specifically**: This plan's Change 3 proposes **lowering** the threshold to 0.65 to catch under-firing cases (e.g. `"paudhe apna khana kaise bnate hai"` scoring ~0.68-0.69, a real academic query being missed). But `"Hello Zuno"` scoring 0.736 means **lowering the threshold makes this over-firing case worse, not better** — 0.736 is already above 0.65 too, and other borderline greeting-like phrases sitting in the 0.65–0.70 band that currently don't fire would start firing once the threshold drops. **The same single global threshold is being pulled in two opposite directions by two different real failure modes** (under-firing on real Hinglish academic queries vs. over-firing on greetings that happen to mention "Zuno"/subject words).

**Before implementing Change 3 as originally written**, do one of:
- **(a)** Run a proper threshold sweep (0.65 / 0.68 / 0.70 / 0.72 / 0.75) against a combined test set that includes BOTH known under-firing queries (from this plan's Testing Plan, Phase 1) AND known over-firing queries (`"Hello Zuno"`, and any other short greeting/small-talk phrases that mention "Zuno" or a subject name) — pick the value that minimizes both error types, not just the one this plan was written to fix.
- **(b)** Prefer a **targeted, non-threshold fix** for the over-firing class instead of moving the global threshold at all: skip the SafetyNet probe entirely when the message is short (e.g. ≤3-4 words) and contains no science-related token — this leaves Change 3's original goal (catch real Hinglish academic misses) untouched while not making the greeting false-positive worse. This was the recommended direction when this was discussed, but not yet implemented — no code changes were made for this, pending a decision.
- **(c)** If neither (a) nor (b) is done before Day 1, at minimum add `"Hello Zuno"` (and similar short greetings mentioning "Zuno") to this plan's **Phase 2 (English Regression Test)** and **Phase 3 (Edge Cases)** query lists, so lowering the threshold doesn't silently introduce this regression unnoticed.

### Finding 3 — Re-embedding is not perfectly stable across runs (context for future re-indexes too)

Scores from `probeAcademicSimilarity` (and any other vector-similarity-based logic) can shift slightly **every time `npm run rag:index` is re-run**, even when the underlying chapter content is unchanged — confirmed the embedded text itself doesn't change (frontmatter is stripped before embedding), so the shift comes from the embedding API call itself, not from a content change. This mainly matters for queries that sit close to whatever threshold is in use. Worth keeping in mind for this plan's Change 3 testing (and the SafetyNet threshold generally) — a threshold value validated today could drift slightly after a future re-index, so borderline cases are worth spot-checking again after any `rag:index` run, not just once at implementation time.

---

## Problem Statement

Students ask questions in Hinglish (Roman-script Hindi), but the pipeline fails at two points:

1. **Decider misclassifies Hinglish questions as OUT_OF_CONTEXT** — "paudhe apna khana kaise bnate hai" (photosynthesis) gets rejected as out of scope, while "photosynthesis kya hai" works perfectly.

2. **Search query uses raw Hinglish against English content** — even when SafetyNet overrides the decider, the vector search uses the raw Hinglish message as the search query, producing weak matches against English content chunks.

**Evidence (from 2026-07-29 production logs):**

```
Turn 2: "paudhe apna khana kaise bnate hai"
  → Decider: OUT_OF_CONTEXT (WRONG — this is Life Processes / photosynthesis)
  → SafetyNet: did not fire (score ~0.68-0.69 < threshold 0.70)
  → Result: "Ye topic Zuno ki scope mein nahi aata" ← WRONG

Turn 3: "are yr ye topic to aata hi hai...ye biology ka swal hai..tree apna kahna kaise bnate hai"
  → Decider: OUT_OF_CONTEXT (WRONG again)
  → SafetyNet: fired (score 0.714 > 0.70) → overrode to CONCEPT_QUESTION ✓
  → Search query: raw noisy message → retrieved WRONG chunks (Reproduction, not Photosynthesis)
  → Source chips: "Vigyan ka Parichay · Jeev Prajanann Kaise Karte Hain?" ← WRONG chunks
  → Tutor: only 8 output tokens, status: insufficient_context
  → Result: "Thodi technical dikkat aayi" ← WRONG

Comparison: "photosynthesis kya hai" → works perfectly (English keyword present)
```

**Root cause**: The pipeline assumes students use English scientific terms. Bihar Board Class 10 students often describe concepts in pure Hinglish without English terms.

---

## Current Runtime Config (IMPORTANT — all OpenAI, not Groq)

```
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
DECIDER_PROVIDER=openai
DECIDER_MODEL=gpt-4o-mini
EMBEDDING_PROVIDER=openai          (text-embedding-3-large, 3072-dim)
USE_INTENT_ROUTER=true
```

All LLM calls and embeddings go through OpenAI. Token costs are real (not free tier).

---

## Solution A: Decider Fix (Prompt Strategy + Search Query Source)

**Summary**: Fix the decider so it (a) classifies Hinglish academic questions correctly, and (b) generates an English search query that retrieval can use.

### Change 1: Decider Prompt — Conservative Bias Strategy

**File**: `backend/src/prompts/deciderPrompt.js`

**What to add** — Insert at the END of the `CONSERVATIVE BIAS RULES` section (after rule 6), before the `SEARCH QUERY RULES` section:

```
7. HINGLISH ACADEMIC SAFETY RULE (CRITICAL — prevents false OUT_OF_CONTEXT):
   If the student's message mentions ANY of the following in ANY language (Hindi, Hinglish, or English),
   classify as CONCEPT_QUESTION — NOT OUT_OF_CONTEXT:
   - Living things: paudhe/plants, janwar/animals, jeev/organisms, insaan/humans, body/sharir
   - Natural phenomena: roshni/light, bijli/electricity, urja/energy, dhoop/sunlight, aag/fire
   - Substances: paani/water, dhatu/metal, acid, nammak/salt, carbon, oxygen, gas
   - Processes: khana banana/making food, saans/breathing, pachan/digestion, janam/birth, marna/death
   - Body parts: aankh/eye, dil/heart, pet/stomach, dimag/brain, phephda/lungs, khoon/blood

   REASON: It is SAFE to over-classify as CONCEPT_QUESTION. If the topic is not in our
   indexed material, retrieval returns empty and tutor says so. But under-classifying
   (wrongly saying OUT_OF_CONTEXT) gives the student a WRONG rejection.

   IMPORTANT: This rule does NOT override the explicit exclusion list in OUT_OF_CONTEXT
   (Newton's Laws, Gravitation, Force/Pressure, Motion/Velocity, Work/Energy, Cell structure,
   Atomic structure, Thermodynamics). Those remain OUT_OF_CONTEXT.

   Examples of this rule firing:
   - "paudhe apna khana kaise banate hain" → CONCEPT_QUESTION (plants + making food = biology)
   - "aankh mein image kaise banta hai" → CONCEPT_QUESTION (eye + image = Human Eye chapter)
   - "bijli kaise banti hai" → CONCEPT_QUESTION (electricity = Physics)
   - "dhatu aur adhatu mein kya fark hai" → CONCEPT_QUESTION (metals = Chemistry)
   - "saans lete waqt kya hota hai" → CONCEPT_QUESTION (breathing = Life Processes)
   - "khoon ka kaam kya hai" → CONCEPT_QUESTION (blood = Life Processes)
```

**Prompt growth**: ~180 words added. Current prompt: ~1538 words → ~1718 words. Growth: ~12%.

**Future growth when new subjects added**: Each subject adds ~10-20 words to scope list + ~20-30 words of Hinglish keyword examples. For 4 new subjects (Maths, Hindi, SSc, English): ~120 words → prompt reaches ~1840 words. Still manageable.

**Why this approach instead of listing every possible Hinglish phrasing**:
- We list CATEGORY KEYWORDS (paudhe, bijli, paani), not full sentence phrasings
- There are ~30-40 core Hinglish category keywords across all of Science
- Students will always use SOME form of these keywords in their questions
- We do NOT need to list every phrasing — just the keywords that signal "this is science-related"

### Change 2: Search Query Source — Use Decider's English Translation

**File**: `backend/src/ask/step4.decideRetrieval.js`

**Current code** (lines 109-122):
```js
let searchQuery = null;
if (needsRetrieval) {
    const isOriginalDevanagari = DEVANAGARI_PATTERN.test(rawQuestion);
    const isExtractedDevanagari = DEVANAGARI_PATTERN.test(rawSearchQuery);

    if (!isOriginalDevanagari) {
        searchQuery = rawQuestion.replace(/\s+/g, ' ').trim();  // ← ALWAYS uses raw Hinglish
    } else if (rawSearchQuery && !isExtractedDevanagari) {
        searchQuery = rawSearchQuery.replace(/\s+/g, ' ').trim();
    } else {
        console.warn('[Step 4] Both Devanagari — skipping retrieval');
    }
}
```

**New code**:
```js
let searchQuery = null;
if (needsRetrieval) {
    const isOriginalDevanagari = DEVANAGARI_PATTERN.test(rawQuestion);
    const isExtractedDevanagari = DEVANAGARI_PATTERN.test(rawSearchQuery);
    const cleanedRaw = rawQuestion.replace(/\s+/g, ' ').trim();

    // STRATEGY (updated 2026-07-29 — was Gemini-specific, now OpenAI):
    //
    // The original rationale for preferring raw questions over LLM-extracted queries
    // was tested against Gemini gemini-embedding-001, which clustered short keywords
    // at ~0.52 cosine. The system now uses OpenAI text-embedding-3-large, which does
    // not exhibit this clustering issue.
    //
    // More importantly: raw Hinglish questions produce WEAK matches against English
    // content (score ~0.68 for "paudhe apna khana kaise bnate hai" vs photosynthesis).
    // The decider's English searchQuery (8-15 word phrase) matches MUCH better.
    //
    // NEW PRIORITY:
    //   1. Decider's English searchQuery (8-15 words, richer than old 2-3 keywords)
    //   2. Raw question as fallback (only if decider didn't generate a searchQuery)
    //
    // Edge case guard: if decider's query is suspiciously short (< 4 words),
    // append the raw question to give the embedding model more signal.

    if (rawSearchQuery && !isExtractedDevanagari) {
        // Decider generated a usable English search query
        const wordCount = rawSearchQuery.split(/\s+/).length;
        if (wordCount >= 4) {
            searchQuery = rawSearchQuery;
            if (isDev) console.log(`[Step 4] Using decider searchQuery (${wordCount} words): "${searchQuery}"`);
        } else {
            // Too short — concatenate with raw for richer embedding
            searchQuery = `${rawSearchQuery} ${cleanedRaw}`;
            if (isDev) console.log(`[Step 4] Decider query short (${wordCount}w), concatenating: "${searchQuery}"`);
        }
    } else if (!isOriginalDevanagari) {
        // No usable English searchQuery — fall back to raw question
        searchQuery = cleanedRaw;
        if (isDev) console.log(`[Step 4] No decider searchQuery, using raw: "${searchQuery}"`);
    } else {
        console.warn('[Step 4] Both original and searchQuery are Devanagari — skipping retrieval');
    }
}
```

**Why this is safe — what could break**:

| Current case | What happens now | What happens after change |
|---|---|---|
| "photosynthesis kya hai" | Raw question → search works ✓ | Decider generates "what is photosynthesis biology" → ALSO works ✓ |
| "acid aur base ka fark" | Raw question → "acid" and "base" match English content ✓ | Decider generates "difference between acid and base properties" → ALSO works ✓ |
| "paudhe apna khana kaise bnate hai" | Raw Hinglish → weak match (0.68) ✗ | Decider generates "how do plants make food photosynthesis" → STRONG match ✓ |
| "Ohm ka niyam samjhao" | Raw question → "Ohm" matches ✓ | Decider generates "Ohm's law electricity resistance" → ALSO works ✓ |

**No regression expected** because the decider's English phrases (8-15 words) are richer than the old "2-3 short keywords" concern. The original stale rationale was Gemini-specific.

### Change 3: SafetyNet Threshold Lower

> ⚠️ **Before touching this, read "Finding 2" in the "READ THIS FIRST" section at the top of this file** — lowering this threshold as originally proposed here may make a separately-discovered false-positive (`"Hello Zuno"` scoring 0.736, above even the current 0.70) worse, not better. Do the threshold sweep or the targeted non-threshold fix described there first.

**File**: `backend/src/ask/intentSafetyNet.js`

**Current** (line 27):
```js
const getThreshold = () =>
    parseFloat(process.env.SAFETY_NET_SIMILARITY_THRESHOLD ?? '0.70');
```

**New**:
```js
const getThreshold = () =>
    parseFloat(process.env.SAFETY_NET_SIMILARITY_THRESHOLD ?? '0.65');
```

**Why 0.65**: "paudhe apna khana kaise bnate hai" scored ~0.68-0.69 against photosynthesis content. At 0.70 threshold, it missed. At 0.65, it catches this and similar edge cases.

**Risk of false positives at 0.65**: The previous threshold was raised from 0.65 to 0.70 because "Newton's Laws" scored ~0.665 against the Human Eye chapter (Newton appears in passing). With Solution A's decider fix, Newton's Laws would be correctly classified as OUT_OF_CONTEXT by the decider (explicit exclusion list), so SafetyNet wouldn't even run for it. The false positive that caused the threshold raise is now prevented by a different mechanism.

### Change 4: SafetyNet Search Query Cleaning (Better Extraction)

**File**: `backend/src/ask/askOrchestrator.js` (lines 104-110)

**Current**:
```js
if (!decision.searchQuery) {
    const cleaned = input.question
        .replace(/\b(bhai|yaar|sir|madam|please|plz|kripya|zara|jaldi|arey|arre)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    decision.searchQuery = cleaned || input.question;
}
```

**New** — more aggressive cleaning for meta-conversation noise:
```js
if (!decision.searchQuery) {
    const cleaned = input.question
        // Remove common Hinglish fillers
        .replace(/\b(bhai|yaar|yr|sir|madam|please|plz|kripya|zara|jaldi|arey|arre|are|haan|nahi|ha|na)\b/gi, '')
        // Remove meta-complaint phrases (student arguing about scope)
        .replace(/\b(ye topic|topic to|aata hi hai|aata hai|scope|mein hai|mein nahi|biology ka|physics ka|chemistry ka|swal hai|sawaal hai|question hai)\b/gi, '')
        // Remove ellipsis and excessive punctuation
        .replace(/\.{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    decision.searchQuery = cleaned || input.question;
}
```

**Example**:
- Input: "are yr ye topic to aata hi hai...ye biology ka swal hai..tree apna kahna kaise bnate hai"
- After cleaning: "tree apna kahna kaise bnate hai"
- This is a MUCH better search query than the raw message

---

## Solution B: Dedicated Translation Step (Backup — implement only if A is insufficient)

**When to implement**: After Solution A is live, test with 15-20 Hinglish queries. If >3 still fail, add Solution B on top of A.

### Architecture

New file: `backend/src/ask/step4b.translateQuery.js`

Runs AFTER step4 (decideRetrieval), BEFORE step5 (retrieveContent). Only fires when:
1. `needsRetrieval === true`
2. searchQuery contains no English scientific terms (detection via keyword list)

### Implementation

```js
// step4b.translateQuery.js

import { createChatModel } from '../llm/chatModel.js';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const TRANSLATE_PROMPT = ChatPromptTemplate.fromMessages([
    ['system', `You are a Hindi/Hinglish to English translator for a Class 10 Science tutor.
Translate the student's question into a clear English phrase (8-15 words).
Focus on the ACADEMIC CONTENT only — ignore greetings, complaints, or meta-conversation.
Use correct scientific terminology when applicable.
Return ONLY the English translation, nothing else.`],
    ['human', '{query}'],
]);

// Common English science terms — if query already has these, skip translation
const ENGLISH_SCIENCE_TERMS = new Set([
    'photosynthesis', 'respiration', 'digestion', 'reproduction', 'heredity',
    'evolution', 'electricity', 'current', 'voltage', 'resistance', 'ohm',
    'magnetic', 'light', 'reflection', 'refraction', 'lens', 'mirror',
    'acid', 'base', 'salt', 'metal', 'carbon', 'periodic', 'element',
    'chemical', 'reaction', 'equation', 'energy', 'solar', 'nuclear',
    'eye', 'retina', 'cornea', 'chlorophyll', 'stomata', 'neuron',
    'hormone', 'enzyme', 'chromosome', 'gene', 'dna', 'ecosystem',
    'food', 'chain', 'web', 'ozone', 'pollution', 'biodegradable',
]);

const hasEnglishScienceTerm = (query) => {
    const words = query.toLowerCase().split(/\s+/);
    return words.some(w => ENGLISH_SCIENCE_TERMS.has(w));
};

let translateChain = null;
const getTranslateChain = () => {
    if (!translateChain) {
        translateChain = TRANSLATE_PROMPT
            .pipe(createChatModel({ temperature: 0, maxTokens: 60 }))
            .pipe(new StringOutputParser());
    }
    return translateChain;
};

export const translateQueryIfNeeded = async (searchQuery, rawQuestion) => {
    // Skip if query already contains English science terms
    if (hasEnglishScienceTerm(searchQuery)) {
        return searchQuery;
    }

    try {
        const translated = await getTranslateChain().invoke({ query: rawQuestion });
        const clean = translated.replace(/\s+/g, ' ').trim();
        if (clean && clean.length > 5) {
            console.log(`[Step 4b] Translated: "${rawQuestion.slice(0, 50)}" → "${clean}"`);
            return clean;
        }
    } catch (err) {
        console.warn('[Step 4b] Translation failed, using original:', err.message);
    }

    return searchQuery; // fallback to original
};
```

### Integration in askOrchestrator.js

```js
// After step4 (decideRetrieval), before step5 (retrieveContent):

// Solution B: Query translation (only if Solution A's decider searchQuery wasn't enough)
if (decision.needsRetrieval && decision.searchQuery) {
    const { translateQueryIfNeeded } = await import('./step4b.translateQuery.js');
    decision.searchQuery = await translateQueryIfNeeded(decision.searchQuery, input.question);
}

const retrieval = await retrieveContent(decision, input, session, abortSignal);
```

### Cost Analysis

| Metric | Per turn | Per 100 questions/day | Per month (3000 q) |
|--------|----------|-----------------------|---------------------|
| Tokens (GPT-4o-mini) | ~80 input + 20 output = ~100 | 10,000 | 300,000 |
| Cost (GPT-4o-mini) | $0.000015 in + $0.00006 out = ~$0.00003 | $0.003 | $0.09 |
| Latency | +200-400ms | — | — |

**Cost is negligible** — $0.09/month at 3000 questions. Latency is the real trade-off.

### When to skip translation (optimization)

Only translate when the query has NO English scientific terms. This skips translation for:
- "photosynthesis kya hai" → has "photosynthesis" → skip ✓
- "acid aur base ka difference" → has "acid", "base" → skip ✓
- "paudhe apna khana kaise bnate hai" → no English terms → TRANSLATE ✓

This means ~60-70% of queries skip translation (most students use at least one English term).

---

## Edge Cases and Mitigations

### Edge Case 1: Over-classification (non-science with science words)

**Example**: "mera pet dard kar raha hai" (my stomach hurts — personal, not academic)

**What happens with Solution A**: Decider sees "pet" (stomach) → might classify CONCEPT_QUESTION → retrieval runs → finds digestion chunks → tutor answers about digestion system

**Is this bad?** Partially — student wasn't asking about Biology, they were expressing pain. But the answer is still factually correct and related.

**Mitigation**: The existing EMOTIONAL_SUPPORT intent handles this. Prompt rule 5 says emotional language overrides science terms. "dard kar raha hai" (hurting) is emotional language. If we strengthen this rule slightly, the decider should route to EMOTIONAL_SUPPORT.

**Severity**: Low. Worst case = student gets an academic answer when they wanted empathy. Not catastrophic.

### Edge Case 2: Topics explicitly NOT in scope (Newton's Laws)

**Example**: "Newton ka teesra niyam kya hai" (Newton's third law)

**What happens with Solution A**: Decider checks the explicit exclusion list → finds "Newton's Laws" → correctly classifies as OUT_OF_CONTEXT. The conservative bias rule explicitly says "does NOT override the explicit exclusion list."

**Risk**: Zero — this is handled by design.

### Edge Case 3: Decider generates poor-quality English searchQuery

**Example**: "paudhe apna khana kaise bnate hai" → decider translates to "plant cooking food" (bad translation)

**Probability**: Low — GPT-4o-mini understands Hinglish well enough for basic translation. Testing required to verify.

**Mitigation**: SafetyNet (at lowered 0.65 threshold) provides backup. Even if search fails, the worst outcome is "insufficient_context" (same as current broken behavior — not worse).

**If this happens frequently**: Add Solution B (dedicated translation step) on top.

### Edge Case 4: Mixed complaint + question messages

**Example**: "are yr ye topic to aata hi hai...ye biology ka swal hai..tree apna kahna kaise bnate hai"

**Solution A path**:
1. Decider sees "tree" + "khana bnate hai" → conservative bias → CONCEPT_QUESTION
2. Decider generates searchQuery: "how do trees/plants make their food biology photosynthesis"
3. Search uses this English query → finds correct photosynthesis chunks ✓

**Solution A + Change 4 (SafetyNet cleaning)**:
Even if decider fails, SafetyNet fires → cleaned query "tree apna kahna kaise bnate hai" → better than raw noisy message

### Edge Case 5: Very short Hinglish questions

**Example**: "bijli" (electricity — one word)

**What happens**: Decider sees "bijli" → conservative bias → CONCEPT_QUESTION. SearchQuery: "electricity" (1 word, < 4 word threshold). Code concatenates: "electricity bijli". Embedding model gets both signals.

**Risk**: Weak match (short query). But "electricity" alone should match the Electricity chapter heading well.

### Edge Case 6: Misspelled Hinglish

**Example**: "fotosinthesis kya ha" (photosynthesis with typos)

**Solution A**: Decider should still understand (GPT-4o-mini handles typos well). SearchQuery: "what is photosynthesis biology".

**Solution B**: Translation step handles typos even better (dedicated task).

**Severity**: Low for A, very low for A+B.

### Edge Case 7: Questions where raw Hinglish CURRENTLY works well

**Example**: "acid aur base ka difference batao"

**Current behavior**: Raw query → "acid" and "base" match English content → correct chunks ✓

**After Solution A**: Decider generates "difference between acid and base properties chemical reactions" → also matches well → no regression ✓

**Evidence**: The decider's searchQuery INCLUDES the English terms + adds context. It won't remove terms that currently work.

### Edge Case 8: Decider classifies correctly but searchQuery is null

**When**: Decider says CONCEPT_QUESTION but generates searchQuery: null (violates prompt rules)

**Mitigation**: Code falls back to raw question (same as current behavior). No worse than before.

---

## Testing Plan

### Phase 1: Hinglish Query Test Suite (MUST PASS before merge)

Test these 15 Hinglish queries — ALL must get correct answers:

**Biology (Life Processes)**:
1. "paudhe apna khana kaise banate hain" → photosynthesis answer
2. "saans lene mein kya hota hai" → respiration answer
3. "khana kaise pachta hai" → digestion answer
4. "khoon ka kaam kya hota hai" → blood/transportation answer
5. "insaan mein bacha kaise paida hota hai" → reproduction answer

**Chemistry**:
6. "namak kaise banta hai" → acids + bases → salt formation
7. "loha mein jung kaise lagti hai" → corrosion/chemical reactions
8. "dhatu aur adhatu mein fark kya hai" → metals vs non-metals

**Physics**:
9. "bijli kaise banti hai" → electricity/sources of energy
10. "aankh mein cheezein kaise dikhti hain" → human eye
11. "chhota aur bada image kaise banta hai" → mirrors/lenses
12. "chumbaak kaise kaam karta hai" → magnetic effects

**Out of scope (must still correctly reject)**:
13. "Newton ka niyam kya hai" → OUT_OF_CONTEXT ✓
14. "cricket ka score kya hai" → OUT_OF_CONTEXT ✓
15. "do aur do kitne hote hain" → OUT_OF_CONTEXT ✓

### Phase 2: English Regression Test (MUST NOT break)

Test these 5 English/mixed queries — all must still work:
1. "photosynthesis kya hai" → correct answer
2. "Ohm's law explain karo" → correct answer
3. "acid aur base ka difference" → correct answer
4. "What is refraction of light" → correct answer
5. "carbon compounds ke types batao" → correct answer

### Phase 3: Edge Case Tests

1. "mera pet dard kar raha hai" → should NOT give biology answer (emotional/greeting)
2. "physics se darr lagta hai" → EMOTIONAL_SUPPORT, not CONCEPT_QUESTION
3. "bye" → GREETING
4. "paudhe" (single word) → should attempt retrieval, not crash
5. "are yr ye topic to aata hi hai biology ka swal hai tree apna kahna kaise bnate hai" → correct answer despite noise

### How to test

Run the dev server, test each query via the frontend or curl:

```bash
curl -X POST http://localhost:5001/api/v1/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "paudhe apna khana kaise banate hain", "studyMode": "global"}'
```

Check logs for:
- `[Step 4]` — intent should be CONCEPT_QUESTION (not OUT_OF_CONTEXT)
- `[Step 4] Using decider searchQuery` — should show English translation
- `[Step 5 Complete]` — should show >0 chunks retrieved
- `[IntentRouter]` — status should be "answered" (not "insufficient_context")

---

## Implementation Order

```
Step 1: Create new branch from main
        git checkout main && git pull && git checkout -b fix/hinglish-query-pipeline

Step 2: Change decider prompt (Change 1)
        File: backend/src/prompts/deciderPrompt.js
        Add conservative bias rule 7 after existing rule 6
        ~180 words addition

Step 3: Change search query source (Change 2)
        File: backend/src/ask/step4.decideRetrieval.js
        Replace lines 109-122 with new search query logic
        Update stale comment about Gemini embeddings

Step 4: Lower SafetyNet threshold (Change 3)
        File: backend/src/ask/intentSafetyNet.js
        Change default from 0.70 to 0.65

Step 5: Improve SafetyNet query cleaning (Change 4)
        File: backend/src/ask/askOrchestrator.js
        Expand filler-word regex to include meta-complaint phrases

Step 6: Run Phase 1 tests (15 Hinglish queries)
        Must: 12/15 correct (queries 1-12)
        Must: 3/3 correctly rejected (queries 13-15)

Step 7: Run Phase 2 tests (5 English regression)
        Must: 5/5 still correct

Step 8: Run Phase 3 tests (5 edge cases)
        Must: 4/5 correct (single word "paudhe" is acceptable to fail)

Step 9: If Phase 1 has >3 failures → implement Solution B
        File: NEW backend/src/ask/step4b.translateQuery.js
        Integration: backend/src/ask/askOrchestrator.js

Step 10: Commit and create PR
```

---

## Rollback Plan

If Solution A causes regressions (English queries break):

1. Revert Change 2 (search query source) — switch back to raw question
2. Keep Change 1 (conservative bias) — this can only help, never hurt
3. Keep Change 3 (SafetyNet threshold) — safe to keep lower

The most likely regression source is Change 2 (search query source). Changes 1, 3, and 4 are safe to keep in all scenarios.

---

## What This Does NOT Fix (Out of Scope)

1. **Devanagari input quality** — Pure Hindi script (नमस्ते) queries already have a fallback path. Not changing that.
2. **Tutor response quality** — The tutor's Hinglish answer generation already works well. Not touching it.
3. **Focus Mode retrieval** — Focus Mode scopes retrieval to a specific chapter. This fix is for Global Mode retrieval. Focus Mode should benefit indirectly (same decider + search query improvements apply).
4. **Content additions** — Not adding or changing any data/ content files. The existing English content is correct and sufficient.
