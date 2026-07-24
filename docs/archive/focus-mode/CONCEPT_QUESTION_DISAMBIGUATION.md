# CONCEPT_QUESTION Disambiguation — Known Residual Risk (documented for future work)

**Status:** NOT STARTED. This is documentation only — no code has been touched, no fix designed yet. Written so this doesn't get lost or re-discovered from scratch later.

**Logged:** 2026-07-12, during the retrieval-architecture audit that found the NEXT_STEP duplicate-content bug (see `FOCUS_MODE_PLAN.md` — chapter-01 Light retrieval collision).

---

## One-line summary

When a student asks Zuno an open, free-text question (`CONCEPT_QUESTION` intent), and a chapter has 2+ topics whose titles/content genuinely overlap in wording, Zuno has no reliable way to know **which specific topic** the student means — it can only guess via semantic similarity. This is a different, harder problem than the NEXT_STEP bug, and is **not fixed** by the Option 2 solution being implemented for that bug.

---

## Why this is a genuinely different problem from the NEXT_STEP bug

### NEXT_STEP (the bug being fixed now)
Zuno already knows, with 100% certainty, exactly which topic to teach next — `getNextTopic()` resolves this deterministically from `ChapterProgress.currentTopicId` + the curriculum index. There is **zero ambiguity about which topic**; the only failure was *fetching the wrong content for a known topic ID* — a lookup problem, solvable by giving each topic a guaranteed, exact link to its own content (Option 2).

### CONCEPT_QUESTION (this problem)
The student types something in their own words — e.g. *"Acid aur base kya hote hain?"* — and there is **no predetermined topic ID at all**. The decider LLM extracts a `searchQuery` from the student's text, and that query is run through chapter-scoped semantic search (`retrieveRelevantChunks(searchQuery, getRetrieverOptions(focusChapter))` in `step5.retrieveContent.js`, line ~181). Whichever chunk scores highest wins. If the chapter has multiple topics that are all legitimately "about" the same general wording, the system has to **guess which one the student meant** — there's no ID to look up by, only fuzzy text to interpret.

**Root cause is related (the same chapters tend to have overlapping topic titles), but the fix mechanism is fundamentally different:** Option 2 (deterministic topic→chunk linking) only removes ambiguity when the topic ID is already known in advance. It does nothing for questions where the topic ID itself is unknown and has to be inferred from the student's phrasing.

---

## Concrete example (real chapter, real topic list)

`chapter-02-acids-bases-and-salts.md` — the curriculum index has these core topics in the same chapter:

- "1. Acids and Bases"
- "3. Chemical Properties of Acids and Bases"
- "4. What Do All Acids and Bases Have in Common?"
- "5. Acids, Bases and Electrical Conductivity"
- "7. Strength of Acids and Bases: pH Scale"

If a student asks a generic question like *"acid base kya hai"* while in Focus Mode on this chapter, there is no clean signal telling the retriever which of these 5 topics is the "right" one — all five are plausibly relevant. Today's retrieval will pick whichever chunk's embedding scores highest for that specific phrasing, which may or may not be the one most useful to the student's actual doubt.

This is **not confirmed as a live, observed bug** the way the NEXT_STEP case was (no student report, no MongoDB evidence pulled yet) — it's a structural risk identified by inspecting the topic list, the same way the general title-overlap scan (see `FOCUS_MODE_PLAN.md`) flagged several other chapters (Metals and Non-metals, Periodic Table, Carbon Compounds, etc.) with similar overlapping topic titles.

---

## Current code path (for whoever picks this up later)

- `backend/src/ask/step5.retrieveContent.js` — `CONCEPT_QUESTION` branch (~line 180): builds `searchQuery` from the decider's extraction of the student's question, then calls `retrieveRelevantChunks(searchQuery, getRetrieverOptions(focusChapter))` — chapter-scoped, but topic-agnostic.
- `backend/src/rag/retriever.js` — does the actual `$vectorSearch` + `metadataFilter` scoping.
- `backend/src/rag/reranker.js` — keyword + intent reranking on top of the raw vector-search results. Currently has no concept of "is this chunk ambiguous relative to sibling topics in the same chapter."
- There is a related, already-fixed fallback: if focus-scoped retrieval returns 0 chunks, `step5.retrieveContent.js` (~line 190) runs a global search to check if the topic exists in a *different* chapter (the out-of-focus redirect, BUG-4). That fallback handles "wrong chapter entirely" — it does not, and was never meant to, handle "right chapter, ambiguous between two topics in it."

---

## Explicitly NOT decided yet — ideas only, not a plan

These are unexplored options, listed only so they aren't lost. None of them have been discussed, scoped, or approved:

- Zuno could ask a short clarifying question when multiple topics score close together, instead of silently picking one ("Kaunsa wala — general acid-base ya electrical conductivity wala?").
- Reranker could down-weight a chunk if 2+ candidate chunks in the same chapter score within a small margin of each other (a "confidence gap" check) and flag the response as lower-confidence.
- Conversation context (what topic the student already advanced past, what they asked before) could bias disambiguation — risky, since this overlaps with the same "which saved state do we trust" class of bug already fixed in BUG-4/BUG-5.

**Do not start implementing any of these without a full Deep Discussion + Solution Presentation pass first — same standing contract as `FOCUS_MODE_PLAN.md`.** This file exists only to make sure the problem itself isn't forgotten, not to pre-commit to a fix direction.

---

## Cross-reference

See `FOCUS_MODE_PLAN.md` → "OPEN / REMAINING WORK" for the pointer to this file, and for the NEXT_STEP bug this was discovered alongside.
