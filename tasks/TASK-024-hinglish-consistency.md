# TASK-024: Hinglish Consistency — FINAL Fix Plan (v3 — Frontmatter-Driven)

**Created**: 2026-07-28
**Priority**: P0 — Product-breaking inconsistency for 99% Hindi-medium students
**Estimated effort**: 2–3 days
**Status**: NOT STARTED
**Branch**: `feature/hinglish-ui-labels`

**v3 change from v2**: v2 used hardcoded JS maps (`CHAPTER_HINGLISH`, `SECTION_HINGLISH`, `SUBJECT_HINGLISH`) for Hinglish titles. Rejected because: only Science subject exists today, and more subjects (Hindi, Math, Social Science, Sanskrit) are coming — a hardcoded map means every future subject's chapters require a developer to remember to add JS entries separately from the content, with silent English fallback if forgotten. v3 moves Hinglish titles into MD frontmatter, next to the content they describe — no separate file to keep in sync.

---

## Problem Statement

Zuno ka target user Bihar Board Class 10 ka Hindi-medium student hai. Lekin app me teen jagah English leak ho rahi hai:

1. **LLM output** — AI answer me bahot se English words leak hote hain (verbs, common nouns, connectors)
2. **UI labels** — Chapter names, section names, topic names, subject labels sab English me dikhte hain
3. **Data sent to LLM** — Curriculum summary aur focus chapter prompt English me jaate hain, isliye LLM bhi English me reply karta hai

**Chapter CONTENT (the actual educational text, embedded for RAG) stays 100% untouched.** Only frontmatter METADATA gets 3 new lines per file (`hinglish_title`, `hinglish_section`, `hinglish_subject`) — these are display labels, not embedded text. Reasoning for not touching content:
- Gemini embeddings English pe best perform karti hain — Hinglish Roman-script low-resource hai
- Hinglish me standard spelling nahi hai — retrieval quality girti
- Current architecture already correct hai: English source → LLM translates to Hinglish output

---

## Architecture

```
DATA LAYER (English MD content)          ← content untouched; frontmatter gets 3 new metadata lines
        ↓
LOADER/CHUNKER (metadata passthrough)    ← FIX HERE (carry new fields through)
        ↓
RETRIEVAL LAYER (vector search)          ← untouched (embedded text unchanged)
        ↓
PROMPT LAYER (instructions)              ← FIX HERE (Layer 2)
        ↓
LLM OUTPUT (Hinglish answer)             ← Improves automatically from prompt fixes
        ↓
UI LAYER (React components)              ← FIX HERE (Layer 3, reads hinglishTitle field — unchanged shape)
```

**Key safety property**: every consumer downstream of `studyMap.service.js` / `curriculumIndexBuilder.js` already reads a `hinglishTitle` field on chapter/section/subject objects. v3 only changes *where that field's value comes from* (frontmatter instead of a hardcoded map) — the field name and shape are identical, so FocusModal, Topbar, ChatPage etc. need ZERO changes for this part.

---

## Full Audit Findings (why v2 was incomplete)

A full pipeline trace turned up 4 things v2 missed entirely:

1. **`data/class-10/science/meta/science-overview.md`** also goes through `validateMarkdownDocument()` (it's excluded from the browsable studyMap via `NON_BROWSABLE_SECTIONS`, but NOT excluded from loader validation). If the 3 new fields are made required without also adding them to this file, `loadMarkdownDocuments()` throws and the **entire server fails to start**. Fix: add the 3 fields to this file too.
2. **`CHAPTER_HINGLISH` has 4 consumers, not 1**: `studyMap.service.js`, `chapterProgress.controller.js` (resume-chapter cards), `sourceFormatter.js` (Sources panel), and `step7.saveAndRespond.js` (imported but **never used** — dead import, unrelated pre-existing bug, cleaned up here).
3. **`markdownChunker.js`'s `createChunk()` builds chunk metadata as an explicit field whitelist** — it does NOT spread `...doc.metadata`. Adding frontmatter fields alone will NOT make them appear in chunk metadata. Without fixing this, `sourceFormatter.js` would silently keep showing English forever in the Sources panel (no crash — just permanently wrong).
4. **`curriculumIndexBuilder.js` only carries English `chapter_title`** into `curriculum-index.json`. `chapterProgress.controller.js` reads chapter titles from there (via `topicResolver.js`), so both files need a `hinglishTitle`/`chapterHinglishTitle` field added.

Also found: `step3.buildContext.js`'s `buildSemanticStudyContext()` sends `"Active Textbook Chapter: {English title}"` straight to the LLM — a Layer 2 leak point not in the original plan. Added as 2.11.

**Verified safe**: `REQUIRED_METADATA_FIELDS` (loader) and `REQUIRED_CHUNK_METADATA` (chunker validator) only check *presence* of required fields, never reject extra/unknown ones — so adding new fields is safe for `test:chunks` / `test:study-map`, as long as finding #1 above is handled.

---

## Pre-Flight Checklist (Read Before Starting)

Before Day 1:
- [ ] Read this entire file top to bottom
- [ ] Confirm no other work is in progress on `backend/src/services/studyMap.service.js` or `frontend/src/components/FocusModal.jsx`
- [ ] Check current LLM provider is working (Groq): `npm run test:ask-db` (needs keys + network)
- [ ] Confirm `USE_INTENT_ROUTER` env var value — it determines which code path is active
  - `USE_INTENT_ROUTER=true` → intentRouter.js path (per-intent prompts)
  - `USE_INTENT_ROUTER=false` (or unset) → legacy tutorPrompt.js path in step6
  - **Both paths must be fixed** — code targets both

After every phase:
- [ ] Restart backend server (studyMap is cached in memory — code changes to studyMap.service.js require restart)
- [ ] Run `npm run test:study-map` from backend
- [ ] Run `npm run build` from frontend

After ALL Day 1 frontmatter + loader/chunker changes:
- [ ] Run `npm run curriculum:build` (cheap, rebuilds curriculum-index.json — no API calls)
- [ ] Run `npm run rag:index` (rebuilds vector-store.json with new chunk metadata — calls Gemini API, has real cost/time; content text is unchanged so this is a metadata-only refresh, but the pipeline has no partial-update mode)

---

## LAYER 3: UI + Metadata Hinglish Labels (Day 1)

### Why first?
- No LLM/prompt risk — this is data + display plumbing
- Highest visible impact — student immediately sees Hinglish everywhere
- Quick confidence boost before tackling prompt work

---

### 3.0 — Add Hinglish frontmatter fields to all 17 content files

**Files**: all 16 chapter MD files under `data/class-10/science/**/*.md` + `data/class-10/science/meta/science-overview.md`

**Pattern** — add 3 new frontmatter lines (content below `---` is untouched):

```yaml
---
board: Bihar Board
class: 10
subject: Science
section: Physics
chapter_no: 1
original_science_chapter_no: 10
chapter_title: Light - Reflection and Refraction
hinglish_title: "Prakash — Paravartan aur Apvartan"
hinglish_section: "Bhautik Vigyan"
hinglish_subject: "Vigyan"
language: English
source_type: cleaned_markdown
---
```

**Full list of 16 chapter values** (corrected: `Paravartan`, not the old `Pratvaran` typo):

| File | hinglish_title |
|---|---|
| physics/chapter-01-light... | Prakash — Paravartan aur Apvartan |
| physics/chapter-02-human-eye... | Maanav Netra aur Rangeen Duniya |
| physics/chapter-03-electricity.md | Bijli |
| physics/chapter-04-magnetic-effects... | Vidyut Dhara ke Chumbakiya Prabhav |
| physics/chapter-05-sources-of-energy.md | Urja ke Srot |
| chemistry/chapter-01-chemical-reactions... | Rasayanik Abhikriyaen aur Samikaran |
| chemistry/chapter-02-acids-bases-and-salts.md | Aml, Kshaar aur Lavan |
| chemistry/chapter-03-metals-and-non-metals.md | Dhatu aur Adhatu |
| chemistry/chapter-04-carbon-and-its-compounds.md | Carbon aur uske Yaugik |
| chemistry/chapter-05-periodic-classification... | Tattvon ki Avart Sarni |
| biology/chapter-01-life-processes.md | Jeevan Prakriyaen |
| biology/chapter-02-control-and-coordination.md | Niyantran aur Samanvay |
| biology/chapter-03-how-do-organisms-reproduce.md | Jeev Prajanann Kaise Karte Hain? |
| biology/chapter-04-heredity-and-evolution.md | Anuvanshikta aur Vikas |
| biology/chapter-05-our-environment.md | Hamara Parayavaran |
| biology/chapter-06-management-of-natural-resources.md | Prakritik Sansadhanon ka Prabandhan |

`hinglish_section` per folder: `physics` → `Bhautik Vigyan`, `chemistry` → `Rasayan Vigyan`, `biology` → `Jeev Vigyan`.
`hinglish_subject` for all Science files: `Vigyan`.

**`meta/science-overview.md`** (section: Meta, not browsable but still validated):
```yaml
hinglish_title: "Vigyan ka Parichay"
hinglish_section: "Parichay"
hinglish_subject: "Vigyan"
```

**Risk**: Zero — purely additive frontmatter, pageContent (embedded text) untouched.

---

### 3.1 — markdownLoader.js: require + validate the 3 new fields

**File**: `backend/src/rag/markdownLoader.js`

**Change 1** — add to `REQUIRED_METADATA_FIELDS` (line 23):
```js
const REQUIRED_METADATA_FIELDS = [
  'board', 'class', 'subject', 'section',
  'chapter_no', 'original_science_chapter_no',
  'chapter_title', 'hinglish_title', 'hinglish_section', 'hinglish_subject',
  'language', 'source_type',
];
```

Since 3.0 adds these fields to ALL 17 files (including the Meta file), making them required here is safe — nothing is exempted, nothing crashes.

**Optional consistency guard** — add a check that all chapters under the same section folder use the same `hinglish_section` value (prevents a typo in one file silently creating a duplicate section in studyMap). Add inside `validateMarkdownDocument`, near the existing `sectionRule` block:
```js
// hinglish_section must be consistent across all chapters in the same folder —
// a typo here would silently create a duplicate section entry in studyMap.
if (sectionRule && metadata.hinglish_section && sectionRule.expectedHinglishSection
    && metadata.hinglish_section !== sectionRule.expectedHinglishSection) {
  errors.push(`hinglish_section mismatch: expected "${sectionRule.expectedHinglishSection}" for folder, got "${metadata.hinglish_section}".`);
}
```
(Requires adding `expectedHinglishSection` to each entry in `SECTION_RULES` — e.g. `physics: { ..., expectedHinglishSection: 'Bhautik Vigyan' }`. Skip this guard if it feels like overkill for MVP; flagging it as optional, not blocking.)

**Risk**: Zero if 3.0 is done first. If 3.0 is incomplete (any file missing a field), server fails to start immediately on next restart — loud failure, not silent, which is the point.

---

### 3.2 — markdownChunker.js: carry Hinglish fields into chunk metadata

**File**: `backend/src/rag/markdownChunker.js`

**Change** — add 3 lines to the explicit metadata object inside `createChunk()` (around line 244, right after `chapter_title`):
```js
chapter_title: doc.metadata.chapter_title,
hinglish_title: doc.metadata.hinglish_title,
hinglish_section: doc.metadata.hinglish_section,
hinglish_subject: doc.metadata.hinglish_subject,
source_path: doc.metadata.source_path,
```

**Risk**: Zero — additive metadata field, `REQUIRED_CHUNK_METADATA` list doesn't need updating (these are optional extras, not required-for-validity fields).

**Note**: This means `npm run rag:index` must be re-run after 3.0+3.1+3.2 land, so `vector-store.json` chunks actually carry these new fields (see Pre-Flight Checklist).

---

### 3.3 — curriculumIndexBuilder.js: expose hinglishTitle on chapter

**File**: `backend/src/curriculum/curriculumIndexBuilder.js`

**Change** — in `createChapter()` (line 91-95), add the field:
```js
return {
  chapterId, number: metadata.chapter_no, originalScienceChapterNumber: metadata.original_science_chapter_no,
  title: metadata.chapter_title, hinglishTitle: metadata.hinglish_title,
  sourcePath: metadata.source_path, fileName: metadata.file_name,
  topicCount: topics.length, coreTopicCount: topics.filter((topic) => topic.role === 'core').length, topics,
};
```

**Risk**: Zero — additive field on `curriculum-index.json`'s chapter objects. Requires `npm run curriculum:build` re-run.

---

### 3.4 — topicResolver.js: forward chapterHinglishTitle

**File**: `backend/src/curriculum/topicResolver.js`

**Change 1** — in `flattenTopics()` (line 29-32), add the field:
```js
topics.push({
  ...topic, chapterId: chapter.chapterId, chapterNumber: chapter.number, chapterTitle: chapter.title,
  chapterHinglishTitle: chapter.hinglishTitle,
  subjectId: subject.subjectId, subjectTitle: subject.title, sectionId: section.sectionId, sectionTitle: section.title,
});
```

**Change 2** — in `toPublicTopic()` (line 64-69), add the field:
```js
const toPublicTopic = (topic) => ({
  topicId: topic.topicId, title: topic.title, order: topic.order, role: topic.role,
  headingPath: topic.headingPath, chapterId: topic.chapterId, chapterNumber: topic.chapterNumber,
  chapterTitle: topic.chapterTitle, chapterHinglishTitle: topic.chapterHinglishTitle,
  subjectId: topic.subjectId, subjectTitle: topic.subjectTitle,
  sectionId: topic.sectionId, sectionTitle: topic.sectionTitle, sourcePath: topic.sourcePath, ragHints: topic.ragHints || [],
});
```

**Risk**: Zero — additive field, existing consumers (test scripts, `getChapterCoreTopics`) unaffected.

---

### 3.5 — studyMap.service.js: read hinglishTitle from metadata

**File**: `backend/src/services/studyMap.service.js`

**Change 1** — remove the `CHAPTER_HINGLISH` import (line 5):
```js
import { SUBJECT_ORDER, SECTION_ORDER } from '../constants/subjectOrder.js';
```

**Change 2** — `createChapterItem()` (line 44-54), read from metadata instead of the map:
```js
const createChapterItem = (doc) => {
  const metadata = doc.metadata;
  return {
    id: createChapterId(metadata),
    number: metadata.chapter_no,
    title: metadata.chapter_title,
    hinglishTitle: metadata.hinglish_title || metadata.chapter_title,
    originalScienceChapterNumber: metadata.original_science_chapter_no,
  };
};
```

**Change 3** — populate `hinglishTitle` on sections. `buildStudyMapFromDocuments()` currently only tracks section `title` via `getOrCreateSection`. Since `hinglish_section` comes from the document metadata (not from a name-keyed lookup), capture it when the section is first created:
```js
const getOrCreateSection = (sectionsById, sectionTitle, sectionHinglishTitle) => {
  const id = createSectionId(sectionTitle);
  if (!sectionsById.has(id)) {
    sectionsById.set(id, { id, title: sectionTitle, hinglishTitle: sectionHinglishTitle || sectionTitle, chapters: [] });
  }
  return sectionsById.get(id);
};
```
Update the call site inside `buildStudyMapFromDocuments()`:
```js
const section = getOrCreateSection(subject.sectionsById, metadata.section, metadata.hinglish_section);
```

**Change 4** — populate `hinglishTitle` on subjects, same pattern:
```js
const getOrCreateSubject = (subjectsById, subjectTitle, subjectHinglishTitle) => {
  const id = createSubjectId(subjectTitle);
  if (!subjectsById.has(id)) {
    subjectsById.set(id, { id, title: subjectTitle, hinglishTitle: subjectHinglishTitle || subjectTitle, sectionsById: new Map() });
  }
  return subjectsById.get(id);
};
```
Update the call site:
```js
const subject = getOrCreateSubject(subjectsById, metadata.subject, metadata.hinglish_subject);
```
And in the final `.map()` that builds the `subjects` array (line 112-121), carry the field through instead of dropping it:
```js
.map((subject) => ({
  id: subject.id,
  title: subject.title,
  hinglishTitle: subject.hinglishTitle,
  sections: [...subject.sectionsById.values()]
    .sort(byConfiguredOrder(SECTION_ORDER, (section) => section.title))
    .map((section) => ({
      ...section,
      chapters: section.chapters.sort((left, right) => left.number - right.number),
    })),
}));
```
(`section` already carries `hinglishTitle` via the object spread `...section` since it was set in `getOrCreateSection` above — no extra line needed there.)

**Risk**: Low. Additive fields, English fallback everywhere.

**⚠ Cache warning**: `getStudyMap()` uses module-level `cachedStudyMap`. Server restart mandatory after this change.

---

### 3.6 — chapterProgress.controller.js: drop CHAPTER_HINGLISH lookup

**File**: `backend/src/controllers/chapterProgress.controller.js`

**Change 1** — remove the import (line 17).

**Change 2** — in `getChapterProgressController` (line 115-117), read the field directly instead of doing a name-keyed lookup:
```js
const chapterTitle = topics[0]?.chapterTitle || progress?.chapterTitle || null;
const hinglishTitle = topics[0]?.chapterHinglishTitle || chapterTitle;
```

**Change 3** — in `listChapterProgressController` (line 164-165):
```js
const currentTopic = topics.find((t) => t.topicId === doc.currentTopicId);
const hinglishTitle = topics[0]?.chapterHinglishTitle || doc.chapterTitle;
```

**Risk**: Low. Depends on 3.3+3.4 landing first (needs `chapterHinglishTitle` on topic objects) and `npm run curriculum:build` being re-run.

---

### 3.7 — sourceFormatter.js: use chunk metadata instead of CHAPTER_HINGLISH

**File**: `backend/src/rag/sourceFormatter.js`

**Change 1** — remove the import (line 17).

**Change 2** — in `formatSources()` (line 63-99), read from chunk metadata:
```js
export const formatSources = (chunks) =>
  chunks.reduce((sources, chunk) => {
    const metadata = chunk.metadata || {};
    const chapterTitle = metadata.chapter_title || 'Unknown';
    const hinglishTitle = metadata.hinglish_title || chapterTitle;
    const headingPath = metadata.heading_path || 'Unknown';
    const topicTitle = cleanTopicTitle(headingPath, chapterTitle);
    const chunkId = metadata.chunk_id || chunk.id || 'Unknown';
    const key = createSourceKey({ chapterTitle, headingPath });

    const existingSource = sources.find((source) => source.sourceId === key);
    if (existingSource) {
      existingSource.chunkIds = [...new Set([...existingSource.chunkIds, chunkId])];
      return sources;
    }

    const sourceNumber = sources.length + 1;
    const source = {
      sourceNumber,
      sourceId: key,
      label: `Source ${sourceNumber}: ${createSourceLabel({ chapterTitle, topicTitle })}`,
      sourceTitle: createSourceLabel({ chapterTitle, topicTitle }),
      chapter_title: chapterTitle,
      chapterTitle,
      hinglishTitle,
      topicTitle,
      section: metadata.section || 'Unknown',
      sectionTitle: metadata.section || 'Unknown',
      heading_path: headingPath,
      headingPath,
      chunk_id: chunkId,
      chunkId,
      chunkIds: [chunkId],
    };

    return [...sources, source];
  }, []);
```

**Risk**: Low. Depends on 3.2 landing first (chunk metadata must carry `hinglish_title`) and `npm run rag:index` being re-run.

---

### 3.8 — step7.saveAndRespond.js: remove dead import

**File**: `backend/src/ask/step7.saveAndRespond.js`

**Change** — remove line 10 (`import { CHAPTER_HINGLISH } from '../constants/chapterHinglish.js';`). Confirmed unused anywhere else in the file — pre-existing dead import, unrelated to this task but caught during the audit.

**Risk**: Zero.

---

### 3.9 — Delete backend/src/constants/chapterHinglish.js

Once 3.5, 3.6, 3.7, 3.8 are all done, no file imports `CHAPTER_HINGLISH` anymore. Delete the file.

**Risk**: Zero — verify with a repo-wide grep for `chapterHinglish` before deleting.

---

### 3.10 — FocusModal: All display labels → Hinglish

**File**: `frontend/src/components/FocusModal.jsx`

No change from v2 plan — this component already reads `subject.hinglishTitle`, `section.hinglishTitle`, `chapter.hinglishTitle` off the studyMap response, and those fields now come from frontmatter instead of a hardcoded map. Same 12 sub-changes as before:

**Fix 1 — SUBJECT_META placeholder titles** (lines 23-30):
```js
const SUBJECT_META = {
  hindi:            { title: 'Hindi',                        icon: TranslateRounded },
  english:          { title: 'English',                      icon: AutoStoriesRounded },
  math:             { title: 'Ganit (Math)',                 icon: FunctionsRounded },
  science:          { title: 'Vigyan (Science)',             icon: ScienceRounded },
  'social-science': { title: 'Samajik Vigyan (Soc. Sci)',    icon: PublicRounded },
  sanskrit:         { title: 'Sanskrit',                     icon: MenuBookRounded },
};
```

**Fix 2 — Prefer hinglishTitle when reading live studyMap subject** (line 78):
```js
title: live?.hinglishTitle || live?.title || meta?.title || id,
```

**Fix 3 — Step titles use hinglishTitle** (lines 141-145):
```js
const stepTitle = step === 1
  ? 'Kya padhna hai aaj?'
  : step === 2
    ? `${selectedSubject?.hinglishTitle || selectedSubject?.title || ''} — bhaag chunno`
    : `${activeSection?.hinglishTitle || activeSection?.title || ''} — adhyaay chunno`;
```

**Fix 4 — Step labels** (line 147):
```js
const stepLabel = step === 1 ? 'Vishay chunno' : step === 2 ? 'Bhaag chunno' : 'Adhyaay chunno';
```

**Fix 5 — Progress label for continue chapters** (line 249):
```jsx
{pct}% ho gaya
```

**Fix 6 — Section label for continue block** (line 221): already correct — verify capitalization.

**Fix 7 — Subject chapter count** (line 276):
```jsx
{subject.available ? `${subjectChapterCounts[subject.id] || 0} adhyaay` : 'Jald aata hai'}
```

**Fix 8 — Section chapter count** (line 300-301):
```jsx
<Typography component="span" sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', mt: 0.5 }}>
  {section.chapters?.length || 0} adhyaay
</Typography>
```

**Fix 9 — Section title display** (line 298):
```jsx
{section.hinglishTitle || section.title}
```

**Fix 10 — Subject title display** (line 273): no change — `subject.title` already resolves via Fix 2.

**Fix 11 — Chapter title in step 3** (line 323):
```jsx
{chapter.hinglishTitle || chapter.title}
```

**Fix 12 — "Ch N" label** (line 320):
```jsx
Adhyaay {chapter.number}
```

**Risk**: Zero for all. `hinglishTitle` always has English fallback in the backend.

---

### 3.11 — Topbar: Tooltip formatting

**File**: `frontend/src/components/Topbar.jsx`

**Fix 1 — Topic count label** (line 56):
```jsx
Topic {displayTopicIndex} / {totalTopics}
```

**Fix 2 — Engagement count label** (line 76): already Hinglish, no change.

**Topic titles inside tooltip (line 68)**: still English (`t.title`, derived from MD headings). DEFERRED — 150 topic titles across 16 chapters, tooltip-only visibility, needs its own topic-level Hinglish infrastructure. Add TODO comment above line 59:
```jsx
{/* TODO: Add topic-level Hinglish titles once chapter/section coverage is verified in production */}
```

**Risk**: Zero.

---

### 3.12 — ChatPage: Focus selection message

**File**: `frontend/src/pages/ChatPage.jsx` (line 69-79)

**Current**:
```js
answer: `Focus on. Ab hum "${chapter.title}" padhenge. Aap chaho toh main seedha chapter start karu, ya aap iska overview janna chahte ho?`,
```

**Fix**:
```js
answer: `Ab hum "${chapter.hinglishTitle || chapter.title}" padhenge. Chaho toh main seedha chapter start karu, ya iska overview janna chahte ho?`,
```

**Risk**: Zero.

---

### 3.13 — AskBar: "turns" is English

**File**: `frontend/src/components/AskBar.jsx` (line 51)

**Fix**:
```jsx
5 baar ho gaya!{' '}
```

**Risk**: Zero.

---

### 3.14 — Skip list (already Hinglish, verified)

- Sidebar.jsx — all labels already Hinglish ✅
- ChatMessage.jsx — SourceFootnote uses `hinglishTitle` (line 51) ✅ (now sourced from `sourceFormatter.js` metadata read, no shape change)
- Topbar "Focus" button — universal term, keep English ✅
- Topbar "Login/Logout" — universal terms, keep English ✅

---

## LAYER 3 SUMMARY

| # | File | Change | Risk |
|---|------|--------|------|
| 3.0 | 16 chapter MD + science-overview.md | +3 frontmatter lines each | Zero |
| 3.1 | markdownLoader.js | Require + validate 3 new fields | Zero (if 3.0 complete) |
| 3.2 | markdownChunker.js | Carry hinglish fields into chunk metadata | Zero |
| 3.3 | curriculumIndexBuilder.js | Add hinglishTitle to chapter object | Zero |
| 3.4 | topicResolver.js | Forward chapterHinglishTitle through topics | Zero |
| 3.5 | studyMap.service.js | Read hinglishTitle from metadata (not map) | Low (cache restart) |
| 3.6 | chapterProgress.controller.js | Drop CHAPTER_HINGLISH lookup | Low |
| 3.7 | sourceFormatter.js | Drop CHAPTER_HINGLISH lookup | Low |
| 3.8 | step7.saveAndRespond.js | Remove dead import | Zero |
| 3.9 | chapterHinglish.js | Delete file | Zero |
| 3.10 | FocusModal.jsx | 12 sub-changes (unchanged from v2) | Zero |
| 3.11 | Topbar.jsx | Tooltip topic count format + TODO comment | Zero |
| 3.12 | ChatPage.jsx | Focus message uses hinglishTitle | Zero |
| 3.13 | AskBar.jsx | "5 turns" → "5 baar" | Zero |

---

## LAYER 2: LLM Prompt & Context Fixes (Day 2)

### Why this matters
UI Hinglish ho jaye but LLM output English leak kare — student ko phir bhi answer samjh nahi aayega. Ye asli UX blocker hai.

---

### 2.1 — Create Science Glossary

**New file**: `backend/src/constants/scienceGlossary.js`

```js
/**
 * scienceGlossary.js
 *
 * English→Hinglish mapping for common Class 10 Science terms.
 * Injected into study-intent prompts (concept_question, explain_more, next_step, exam_info)
 * so the LLM has explicit translations for terms it would otherwise leak in English.
 *
 * PATTERN: 'english_term': 'hindi_transliteration (english_term)'
 *   - Student sees Hindi first (comprehension), then English (exam recognition).
 *   - Some terms stay as-is where English is universally understood
 *     (lens, pH, DNA, electron, hormone) — over-translation confuses more than helps.
 *
 * NOT included: chapter names (those come via focusChapterPrompt + curriculumSummary).
 */

export const SCIENCE_GLOSSARY = {
  // ─── Physics ──────────────────────────────────
  'reflection': 'paravartan (reflection)',
  'refraction': 'apvartan (refraction)',
  'lens': 'lens',
  'mirror': 'darpan (mirror)',
  'image': 'pratibimb (image)',
  'focal length': 'naabhiik doori (focal length)',
  'magnification': 'aavardhan (magnification)',
  'concave': 'avatal (concave)',
  'convex': 'uttal (convex)',
  'electric current': 'vidyut dhara (electric current)',
  'resistance': 'pratirodh (resistance)',
  'potential difference': 'vibhavantaar (potential difference)',
  'voltage': 'voltage',
  'circuit': 'parpath (circuit)',
  'magnetic field': 'chumbakiya kshetra (magnetic field)',
  'electromagnetic induction': 'vidyut chumbakiya preran (electromagnetic induction)',
  'renewable energy': 'navikarniya urja (renewable energy)',
  'solar energy': 'saurya urja (solar energy)',
  'spectrum': 'varna patt (spectrum)',
  'dispersion': 'vikiran (dispersion)',
  'retina': 'retina',
  'cornea': 'cornea',
  'pupil': 'putli (pupil)',

  // ─── Chemistry ────────────────────────────────
  'chemical reaction': 'rasayanik abhikriya (chemical reaction)',
  'chemical equation': 'rasayanik samikaran (chemical equation)',
  'oxidation': 'upchayan (oxidation)',
  'reduction': 'apchayan (reduction)',
  'acid': 'aml (acid)',
  'base': 'kshaar (base)',
  'salt': 'lavan (salt)',
  'pH': 'pH',
  'indicator': 'suchak (indicator)',
  'metal': 'dhatu (metal)',
  'non-metal': 'adhatu (non-metal)',
  'alloy': 'mishradhatu (alloy)',
  'corrosion': 'sankharan (corrosion)',
  'carbon compound': 'carbon yaugik (carbon compound)',
  'hydrocarbon': 'hydrocarbon',
  'homologous series': 'samjatiya shreni (homologous series)',
  'functional group': 'kriyaneel samuh (functional group)',
  'periodic table': 'avart sarni (periodic table)',
  'atomic number': 'parmanoo sankhya (atomic number)',
  'electron': 'electron',
  'proton': 'proton',
  'neutron': 'neutron',
  'valency': 'sanyojkta (valency)',
  'element': 'tatva (element)',
  'compound': 'yaugik (compound)',

  // ─── Biology ──────────────────────────────────
  'photosynthesis': 'prakash sanshleshan (photosynthesis)',
  'respiration': 'shwasan (respiration)',
  'nutrition': 'poshan (nutrition)',
  'digestion': 'pachan (digestion)',
  'excretion': 'utsarjan (excretion)',
  'transportation': 'parivahan (transportation)',
  'autotrophic': 'swaposhi (autotrophic)',
  'heterotrophic': 'paraposhi (heterotrophic)',
  'enzyme': 'enzyme',
  'hormone': 'hormone',
  'neuron': 'tantrka koshika (neuron)',
  'synapse': 'synapse',
  'reflex action': 'prativert kriya (reflex action)',
  'nervous system': 'tantrika tantra (nervous system)',
  'endocrine system': 'antahsravi tantra (endocrine system)',
  'reproduction': 'prajanann (reproduction)',
  'fertilization': 'nishechan (fertilization)',
  'pollination': 'paragnayan (pollination)',
  'heredity': 'anuvanshikta (heredity)',
  'evolution': 'vikas (evolution)',
  'gene': 'gene',
  'DNA': 'DNA',
  'variation': 'vibhinnata (variation)',
  'natural selection': 'prakritik chayan (natural selection)',
  'ecosystem': 'paristhitiki tantra (ecosystem)',
  'food chain': 'aahar shrinkhla (food chain)',
  'food web': 'aahar jaal (food web)',
  'biodegradable': 'jaivik apghataneeya (biodegradable)',
  'ozone layer': 'ozone parat (ozone layer)',
  'chlorophyll': 'haritlav (chlorophyll)',

  // ─── Common Science Verbs/Terms ───────────────
  'process': 'prakriya',
  'formed': 'banta hai',
  'produced': 'banaya jaata hai',
  'used': 'istemal hota hai',
  'known as': 'jaana jaata hai',
  'called': 'kehte hain',
  'occurs': 'hota hai',
  'contains': 'isme hota hai',
  'consists of': 'milke bana hai',
  'important': 'zaroori',
  'example': 'misal / udaharan',
  'different': 'alag',
  'because': 'kyunki',
  'therefore': 'isliye',
};

/**
 * Formats the glossary as a compact string for prompt injection.
 */
export const formatGlossaryForPrompt = () =>
  Object.entries(SCIENCE_GLOSSARY)
    .map(([en, hi]) => `${en} → ${hi}`)
    .join(' | ');
```

**Token cost**: ~1200 tokens formatted. Only injected for study intents.

---

### 2.2 — Rewrite `getAnswerLanguageInstruction` — intent-aware, no template collision

**File**: `backend/src/utils/languageDetector.js`

**⚠ Critical bug avoided**: `{glossary}` must NOT be used as a template placeholder inside the returned instruction string — `ChatPromptTemplate` treats `{variable}` as substitution slots and this string is a VALUE passed into `{answerLanguageInstruction}`, not a nested template. Format the glossary INSIDE this function and concatenate.

**Change 1 — Update signature** to accept intent:
```js
import { SCIENCE_GLOSSARY, formatGlossaryForPrompt } from '../constants/scienceGlossary.js';

// Intents where glossary is useful (student expects a science explanation).
// GREETING, EMOTIONAL_SUPPORT, OUT_OF_CONTEXT, UNSAFE_OR_ABUSIVE: no glossary
// (short conversational replies — 1200 tokens of glossary = pure waste).
const STUDY_INTENTS = new Set(['CONCEPT_QUESTION', 'EXPLAIN_MORE', 'NEXT_STEP', 'EXAM_INFO', 'CHOOSE_COURSE']);

/**
 * Builds the language instruction line that gets added to LLM prompts.
 * @param {string} answerLanguage - 'hinglish' | 'hindi' | 'english'
 * @param {string} [intent]       - Decider intent; when it's a study intent, the
 *                                  science glossary is appended for translation guidance.
 */
export const getAnswerLanguageInstruction = (answerLanguage, intent = null) => {
  if (answerLanguage === 'hindi') {
    return 'Write the final answer in simple, warm, and clear Hindi using Devanagari script since the student asked in Devanagari. Keep the explanation engaging like a Bihar classroom teacher addressing their student.';
  }

  const baseHinglish =
    'LANGUAGE: Simple Roman-script Hinglish for Class 10 Bihar Board students. These students understand Hindi and Hinglish but NOT English sentences.\n\n' +
    'STRICT RULES:\n' +
    '1. SOURCE TRANSLATION (CRITICAL): Retrieved content is English. You MUST reformulate it into Hinglish — NEVER copy English sentences.\n' +
    '2. SENTENCE STRUCTURE: Hindi word order MANDATORY. CORRECT: "light reflect hoti hai". WRONG: "light is reflected".\n' +
    '3. VOCABULARY RULE (CRITICAL):\n' +
    '   - Common English words MUST be replaced with Hindi equivalents.\n' +
    '   - ONLY these types of English words may stay: scientific terms with no clean Hindi equivalent (lens, pH, DNA, enzyme, hormone), chemical formulas (H2O, CO2, NaOH), units (volt, ampere, ohm, joule), proper nouns (Newton, Mendeleev).\n' +
    '   - When using a scientific term with a Hindi equivalent, ALWAYS write on FIRST mention: "hindi transliteration (english term)". After first mention, either form is fine.\n' +
    '4. HEADING RULE: Section headings MUST be Hinglish/Hindi. WRONG: "Introduction", "Summary", "Explanation". CORRECT: "Parichay", "Saaransh", "Kaise Hota Hai", "Misal".\n' +
    '5. NO Devanagari script anywhere in a Hinglish response.\n' +
    '6. SELF-CHECK before responding: scan your output for any English sentence (English subject + English verb + English object). If found, rewrite in Hinglish word order.';

  if (intent && STUDY_INTENTS.has(intent)) {
    return `${baseHinglish}\n\nSCIENCE GLOSSARY (use these exact translations on first mention):\n${formatGlossaryForPrompt()}`;
  }

  return baseHinglish;
};
```

**Note on the pre-existing `if (answerLanguage === 'english')` branch**: dead code (`detectQuestionLanguage` never returns `'english'` anymore). Remove it — the function safely falls through to `baseHinglish`.

**Risk**: Low. Signature change is backward-compatible (intent is optional).

---

### 2.3 — Update BOTH call sites of getAnswerLanguageInstruction

**Call site 1 — Legacy path**: `backend/src/ask/step6.generateResponse.js` (line 158)
```js
const targetLanguageInstruction = getAnswerLanguageInstruction(language.answerLanguage, decision.intent);
```

**Call site 2 — Intent router path**: `backend/src/ask/intentRouter.js` (line 113, inside `buildPromptInput`)
```js
const answerLang = getAnswerLanguageInstruction(language.answerLanguage, intent);
```
(`intent` is already the first parameter of `buildPromptInput(intent, input, context, retrieval)` — just use it directly, no plumbing needed.)

**Risk**: Low. Both paths get the same fix.

---

### 2.4 — Add few-shot examples to tutorPrompt.js (legacy path)

**File**: `backend/src/prompts/tutorPrompt.js`

After EXAMPLE C block (line 32), add:

```
EXAMPLE D — English vocabulary leakage (CRITICAL)
❌ AVOID (English leaking): "Photosynthesis is a process in which plants convert carbon dioxide and water into glucose. This process requires sunlight and chlorophyll."
❌ ALSO AVOID (half-translated): "Photosynthesis ek process hai jisme plants carbon dioxide aur water ko glucose mein convert karte hain. This process sunlight aur chlorophyll require karta hai."
✅ USE (proper Hinglish): "Prakash sanshleshan (photosynthesis) ek aisi prakriya hai jisme paudhe CO2 aur paani ko glucose mein badalte hain. Iske liye dhoop aur haritlav (chlorophyll) zaruri hota hai."

EXAMPLE E — Common word replacement
❌ AVOID: "Acids are important because they are used in many different processes."
❌ ALSO AVOID: "Acids important hain because ye different processes mein used hote hain."
✅ USE: "Aml (acids) bahut zaroori hain kyunki ye kai alag-alag prakriyaon mein istemal hote hain."
```

---

### 2.5 — Add SAME few-shot examples to intent-router study prompts

**Files** — add EXAMPLE D and E blocks to each of these (or add via `corePersona.js` if all study prompts share it):
- `backend/src/prompts/intents/corePersona.js` — check if it's used by all study intents. If yes, add examples HERE (single source of truth)
- Otherwise add individually to: `conceptQuestionPrompt.js`, `explainMorePrompt.js`, `nextStepPrompt.js`

**Action**: Open `corePersona.js` first. If it's imported by all study intent prompts (already confirmed used in `chooseCoursePrompt.js` line 16), add examples there. Otherwise add per-file.

**Risk**: Low.

---

### 2.6 — Strengthen TRANSLATION MANDATE in tutorPrompt.js

**File**: `backend/src/prompts/tutorPrompt.js`

**Replace lines 104-106** with:
```
- TRANSLATION MANDATE (CRITICAL): The Retrieved study context is written in English. You MUST:
  * Reformulate ALL facts into Hinglish — never copy English sentences from the source
  * Replace common English words with Hindi equivalents (see Glossary in language instruction)
  * Write scientific terms as: "hindi transliteration (English term)" on FIRST mention, then use either form
  * SELF-CHECK before responding: scan your output for English sentences. If you find any full English clause (subject + English verb + English object), rewrite it in Hinglish word order
```

**Risk**: Zero.

---

### 2.7 — formatStudyMapSummary uses hinglishTitle

**File**: `backend/src/ask/promptHelpers.js`

Replace `formatStudyMapSummary` function (line 80-97):

```js
export const formatStudyMapSummary = (studyMap) => {
  const subjects = studyMap?.focusStudy?.subjects || [];
  if (!subjects.length) return 'No curriculum map is available.';

  return subjects.map((subject) => {
    const subjectLabel = subject.hinglishTitle || subject.title;
    const sections = (subject.sections || []).map((section) => {
      const sectionLabel = section.hinglishTitle || section.title;
      const chapters = (section.chapters || [])
        .map((chapter) => `${chapter.number}. ${chapter.hinglishTitle || chapter.title}`)
        .join('; ');
      return `${sectionLabel}: ${chapters}`;
    });
    return `${subjectLabel}\n${sections.join('\n')}`;
  }).join('\n\n');
};
```

**Risk**: Low. Depends on 3.5 being deployed first (needs `hinglishTitle` on section/subject).

---

### 2.8 — focusChapterPrompt uses hinglishTitle (no lookup needed — field is already present)

**File**: `backend/src/ask/step3.buildContext.js`

`focusChapter` is built by `createChapterLookupItem()` in `studyMap.service.js`, which spreads `...chapter` — so `focusChapter.hinglishTitle` is already available directly, no separate lookup map needed (this is simpler than the v2 plan, which used a `CHAPTER_HINGLISH[...]` lookup — that map no longer exists after 3.9).

**Change — `buildFocusChapterPrompt`** (line 25-30):
```js
const buildFocusChapterPrompt = (focusChapter) => {
  if (!focusChapter) return 'No focus chapter selected.';
  const chapterName = focusChapter.hinglishTitle || focusChapter.title;
  const sectionName = focusChapter.sectionHinglishTitle || focusChapter.sectionTitle;
  const subjectName = focusChapter.subjectHinglishTitle || focusChapter.subjectTitle;
  return `${subjectName} > ${sectionName} > Adhyaay ${focusChapter.number ?? '?'}: ${chapterName}`;
};
```

**Prerequisite**: `createChapterLookupItem()` in `studyMap.service.js` (line 56-67) currently only spreads `subjectTitle`/`sectionTitle`, not their Hinglish equivalents. Add them:
```js
const createChapterLookupItem = ({ subject, section, chapter }) => ({
  ...chapter,
  subjectId: subject.id,
  subjectTitle: subject.title,
  subjectHinglishTitle: subject.hinglishTitle,
  sectionId: section.id,
  sectionTitle: section.title,
  sectionHinglishTitle: section.hinglishTitle,
  metadataFilter: {
    subject: subject.title,
    section: section.title,
    chapter_no: chapter.number,
  },
});
```
(Fold this into step 3.5 above when implementing — noted here separately because it's specifically needed for this fix.)

**Risk**: Zero.

---

### 2.9 — Fix buildSemanticStudyContext leak (NEW — found during audit, not in v1/v2)

**File**: `backend/src/ask/step3.buildContext.js`

**Current** (line 36-64) — `buildSemanticStudyContext()` reads `ch.title` (English) and sends it straight to the LLM as `"Active Textbook Chapter: {foundChapter}"`. This bypasses `focusChapterPrompt` entirely and was missed in both earlier plan versions.

**Fix** — line 52, use the Hinglish field:
```js
foundChapter = ch.hinglishTitle || ch.title;
```

**Risk**: Zero.

---

### 2.10 — Fix hardcoded English in intentRouter response titles

**File**: `backend/src/ask/intentRouter.js`

**Fix 1 — CHAPTER_COMPLETE title** (line 191):
```js
title: 'Adhyaay poora hua!',
```

**Fix 2 — Out-of-focus response** (line 207-213). `input.focusChapter` already carries `hinglishTitle` (see 2.8's prerequisite) — no map lookup needed:
```js
const chapterTitle = input.focusChapter?.hinglishTitle || input.focusChapter?.title || 'is chapter';
```

**Risk**: Low.

---

### 2.11 — Same fix for step6 legacy path CHAPTER_COMPLETE

**File**: `backend/src/ask/step6.generateResponse.js` (line 137-149)

**Fix — line 141**:
```js
title: 'Adhyaay poora hua!',
```

**Risk**: Zero.

---

## LAYER 2 SUMMARY

| # | File | Change | Risk |
|---|------|--------|------|
| 2.1 | NEW: scienceGlossary.js | 80-term glossary + formatter | Zero |
| 2.2 | languageDetector.js | Intent-aware, glossary-integrated instruction | Low |
| 2.3 | step6.generateResponse.js + intentRouter.js | Pass intent to language instruction | Low |
| 2.4 | tutorPrompt.js | Add EXAMPLE D + E (legacy path) | Low |
| 2.5 | corePersona.js (or per-intent prompts) | Add EXAMPLE D + E (intent-router path) | Low |
| 2.6 | tutorPrompt.js | Expanded TRANSLATION MANDATE | Zero |
| 2.7 | promptHelpers.js | formatStudyMapSummary uses hinglishTitle | Low |
| 2.8 | step3.buildContext.js + studyMap.service.js | focusChapterPrompt uses hinglishTitle (direct field, no map) | Zero |
| 2.9 | step3.buildContext.js | buildSemanticStudyContext uses hinglishTitle (NEW finding) | Zero |
| 2.10 | intentRouter.js | Adhyaay poora hua! title + hinglish chapter name (direct field) | Low |
| 2.11 | step6.generateResponse.js | Adhyaay poora hua! title (legacy path) | Zero |

---

## Day 3: Testing & Verification

### 3.A — Test query set (20 queries minimum)

**Category A — Concept questions (English leakage check)**:
1. "Photosynthesis kya hai?"
2. "Ohm ka niyam samjhao"
3. "Acid aur base ka difference batao"
4. "Carbon compounds ke baare me batao"
5. "Paravartan kya hota hai?"
6. "Ohm's law explain karo"
7. "Reflex action kaise hota hai?"

**Category B — CHOOSE_COURSE (Hinglish chapter names)**:
8. "Physics padhna hai"
9. "Chemistry shuru karo"
10. "Biology chapters dikhao"
11. "Science me kya kya hai?"

**Category C — Focus mode UI**:
12. Open FocusModal → verify "Vigyan (Science)" shown
13. Click Science → verify "Bhautik Vigyan" shown
14. Click Physics → verify chapter names in Hinglish
15. Select a chapter → verify Topbar pill shows Hinglish title
16. Hover Topbar pill → verify tooltip (topic list still English by design)

**Category D — Conversation**:
17. "Hi"
18. "Kaise ho?"
19. "Boring hai padhai"

**Category E — Edge cases**:
20. Complete a chapter → verify "Adhyaay poora hua!" title (not "Chapter Complete!")

### 3.B — Leakage measurement

For each Category A response, count:
- Total words
- English non-technical words (excluding: lens, pH, DNA, enzyme, hormone, chemical formulas, units, proper nouns)
- Calculate `leakage_ratio = english_words / total_words`

**Baseline**: Estimated ~30-40% leakage currently.
**Target**: <10% after fixes.
**Escalate if**: >15% after all fixes — indicates prompt fixes aren't enough, may need post-processing pass.

### 3.C — Full test suite
```bash
cd frontend && npm run build              # Must pass
cd backend
npm run curriculum:build                  # Rebuild curriculum-index.json (needed after 3.0+3.3)
npm run rag:index                         # Rebuild vector-store.json (needed after 3.0+3.2 — calls Gemini API)
npm run test:chunks                       # RAG chunker sanity
npm run test:study-map                    # Study map (verifies hinglishTitle populates)
npm run test:vector-store                 # Vector store integrity
npm run test:curriculum-resolvers         # Curriculum lookups
npm run test:chat-db-models               # DB schema
```

### 3.D — Manual regression checklist

- [ ] Session list still shows correct chapter names for sessions started before this change? (DB stores English title in ChapterProgress; display derives hinglishTitle via curriculum-index lookup at read-time — verify no crash for old sessions)
- [ ] In-progress chapter cards in FocusModal show Hinglish? (uses `cp.hinglishTitle` from backend)
- [ ] Global mode (no focus chapter) works normally — no chapter name to hinglish-ify
- [ ] Language detection still works: Devanagari query → Hindi response (glossary NOT injected)
- [ ] LLM provider fallback works if primary fails
- [ ] Server actually starts after 3.0+3.1 (the "loud failure" safeguard) — confirm by temporarily removing one hinglish field from one file and checking the server fails to boot, then re-add it

---

## Implementation Order

### Day 1 (~5 hours) — Layer 3
1. Add frontmatter fields to all 17 content files (3.0)
2. Update markdownLoader.js required fields (3.1)
3. Update markdownChunker.js chunk metadata (3.2)
4. Update curriculumIndexBuilder.js (3.3)
5. Update topicResolver.js (3.4)
6. Update studyMap.service.js — read from metadata (3.5, includes createChapterLookupItem prerequisite for 2.8)
7. Update chapterProgress.controller.js (3.6)
8. Update sourceFormatter.js (3.7)
9. Remove dead import in step7.saveAndRespond.js (3.8)
10. Delete chapterHinglish.js — verify no remaining imports first (3.9)
11. **Restart server** — confirms loader validation passes
12. `npm run curriculum:build` and `npm run rag:index`
13. Update FocusModal.jsx (3.10 — all 12 sub-changes)
14. Update Topbar.jsx (3.11)
15. Update ChatPage.jsx (3.12)
16. Update AskBar.jsx (3.13)
17. `npm run build` in frontend — must pass
18. Manual visual check: open FocusModal, click through all 3 steps
19. Verify session cards, Topbar pill, focus message, Sources panel all Hinglish

### Day 2 (~5 hours) — Layer 2
1. Create scienceGlossary.js (2.1)
2. Rewrite getAnswerLanguageInstruction (2.2)
3. Update step6.generateResponse.js call site (2.3)
4. Update intentRouter.js call site (2.3)
5. Add EXAMPLE D+E to tutorPrompt.js (2.4)
6. Add EXAMPLE D+E to corePersona.js OR per-intent prompts (2.5)
7. Strengthen TRANSLATION MANDATE in tutorPrompt.js (2.6)
8. Update formatStudyMapSummary in promptHelpers.js (2.7)
9. Update buildFocusChapterPrompt in step3.buildContext.js (2.8)
10. Fix buildSemanticStudyContext (2.9)
11. Fix intentRouter hardcoded titles (2.10)
12. Fix step6 CHAPTER_COMPLETE title (2.11)
13. **Restart server**
14. Run 10 Category A queries manually — check for English leakage

### Day 3 (~3 hours) — Verification
1. Run all 20 test queries (Categories A-E)
2. Measure leakage ratio on Category A
3. Iterate on glossary/prompt if leakage >15%
4. Run full test suite
5. Manual regression checklist
6. Deploy

---

## What We Are NOT Doing (and Why)

| Temptation | Why NOT |
|-----------|---------|
| Convert MD chapter content (pageContent) to Hinglish | Embedding quality drops, spelling inconsistency, weeks of work, high risk |
| Translate all 150 topic titles | Low visibility (tooltip only), high manual effort, add as follow-up task |
| Fine-tune LLM for Hinglish | Overkill for MVP, need 10k+ conversations first |
| Add post-generation Hinglish validator | Adds latency + cost — try prompt fixes first, revisit if leakage >15% |
| Change subject/section/chapter IDs | Would break all existing sessions, focus mode state, DB references |
| Translate "Focus"/"Login" UI buttons | Universally understood tech terms — translation would confuse |
| Show English title in brackets everywhere (e.g. "Prakash (Light...)") | Explicitly deferred by product owner — reintroduces the exact English clutter this task removes; data (English title) stays available for a future targeted feature (e.g. exam-prep cross-reference), display decision revisited then |
| Build a content-authoring UI/validation tool for hinglish_* fields | Overkill for a 17-file, single-subject MVP; a loud loader-validation failure is enough |

---

## Files Changed — Final List

### Content (17 files)
1. All 16 chapter MD files under `data/class-10/science/**/*.md` — +3 frontmatter lines each
2. `data/class-10/science/meta/science-overview.md` — +3 frontmatter lines

### Backend (11 files)
1. `backend/src/rag/markdownLoader.js` — require + validate 3 new fields
2. `backend/src/rag/markdownChunker.js` — carry hinglish fields into chunk metadata
3. `backend/src/curriculum/curriculumIndexBuilder.js` — add hinglishTitle to chapter object
4. `backend/src/curriculum/topicResolver.js` — forward chapterHinglishTitle through topics
5. `backend/src/services/studyMap.service.js` — read hinglishTitle from metadata; carry section/subject hinglish through createChapterLookupItem
6. `backend/src/controllers/chapterProgress.controller.js` — drop CHAPTER_HINGLISH lookup
7. `backend/src/rag/sourceFormatter.js` — drop CHAPTER_HINGLISH lookup, use chunk metadata
8. `backend/src/ask/step7.saveAndRespond.js` — remove dead import
9. `backend/src/constants/scienceGlossary.js` — NEW file
10. `backend/src/utils/languageDetector.js` — intent-aware instruction + glossary injection
11. `backend/src/ask/promptHelpers.js` — formatStudyMapSummary uses hinglishTitle
12. `backend/src/ask/step3.buildContext.js` — buildFocusChapterPrompt + buildSemanticStudyContext use hinglishTitle
13. `backend/src/ask/step6.generateResponse.js` — pass intent to lang instruction + Adhyaay poora hua title
14. `backend/src/ask/intentRouter.js` — pass intent to lang instruction + Hinglish titles
15. `backend/src/prompts/tutorPrompt.js` — EXAMPLE D+E + expanded TRANSLATION MANDATE
16. `backend/src/prompts/intents/corePersona.js` (OR individual intent prompts) — EXAMPLE D+E

### Deleted (1 file)
1. `backend/src/constants/chapterHinglish.js`

### Frontend (4 files)
1. `frontend/src/components/FocusModal.jsx` — 12 label changes to Hinglish
2. `frontend/src/components/Topbar.jsx` — tooltip topic format + TODO comment
3. `frontend/src/pages/ChatPage.jsx` — focus message uses hinglishTitle
4. `frontend/src/components/AskBar.jsx` — "5 turns" → "5 baar"

### Rebuild required after content/backend changes
- `backend/storage/curriculum-index.json` — via `npm run curriculum:build`
- `backend/storage/vector-store.json` — via `npm run rag:index` (metadata refresh, no content/embedding quality change)

### No changes needed
- `frontend/src/components/ChatMessage.jsx` — already uses hinglishTitle
- `frontend/src/components/Sidebar.jsx` — already Hinglish

---

## Rollback Plan

If anything breaks after deploying:

1. **UI issue only** → git revert the frontend commit; backend Hinglish fields are harmless additive data.
2. **LLM output broken** → set `USE_INTENT_ROUTER` to opposite value temporarily (falls back to other path), OR revert `getAnswerLanguageInstruction` to previous single-arg signature.
3. **Server fails to start after 3.0/3.1** → means a frontmatter file is missing one of the 3 new fields; the error message names the exact file and field — add the missing line, restart.
4. **Study map / curriculum-index API breaks** → git revert `studyMap.service.js` / `curriculumIndexBuilder.js` changes; frontend fallbacks (`|| chapter.title`) handle a missing `hinglishTitle` gracefully.
5. **Nuclear option** → git revert all commits in the branch; re-run `npm run curriculum:build` and `npm run rag:index` once more to regenerate the pre-change JSON artifacts. No DB schema changes anywhere.

All changes are backward-compatible and rollback-safe. No irreversible operations.
