# Archived — Hinglish Consistency (TASK-024)

TASK-024's scope (Layer 3 — UI/metadata Hinglish labels, Layer 2 — LLM prompt/glossary
Hinglish enforcement) is **DONE**, merged to `main`, and CI-verified. This folder is the
permanent historical record — kept for reference, not the current source of truth for
active work.

**Start with [`TASK-024-hinglish-consistency.md`](TASK-024-hinglish-consistency.md)** —
the full v3 plan (frontmatter-driven Hinglish titles + LLM prompt/glossary fixes), with
file-by-file changes and testing plan.

## Status summary (as of 2026-07-29)

- ✅ **Layer 3 (Day 1 — UI/metadata)**: Hinglish titles moved from a hardcoded
  `CHAPTER_HINGLISH` map into MD frontmatter (`hinglish_title`, `hinglish_section`,
  `hinglish_subject`), carried through loader → chunker → curriculum index → studyMap →
  FocusModal/Topbar/ChatPage. Merged in commit `1276eeb`.
- ✅ **Layer 2 (Day 2 — LLM prompt)**: Science glossary added, `getAnswerLanguageInstruction`
  made intent-aware, the two places the app fed English chapter/section/subject names into
  the LLM context (`buildFocusChapterPrompt`, `buildSemanticStudyContext`,
  `formatStudyMapSummary`) fixed to use Hinglish titles. Merged in commit `8f1660d`.
- ✅ **Day 3 (testing)**: `scripts/run-golden-set.js` fixed to parse the SSE stream (was
  broken, blocking any golden-set run) and used to verify both layers end-to-end.

## Related — found during later verification, NOT part of this task's scope

A follow-up QA pass on 2026-07-29 (same day) re-ran the golden set live and found 2
small, unrelated bugs, plus one important cross-cutting finding for the *next* piece of
work (`HINGLISH_QUERY_FIX_PLAN.md`, root of the repo — not yet started):

- 2 bugs (validation-error mislabeling in `askOrchestrator.js`, a wrong expected-value in
  the `BS04` golden-test query) — fixed on branch `fix/error-handling-and-golden-set-wip`.
- A SafetyNet threshold tension (`"Hello Zuno"` now scores 0.736 on the academic-similarity
  probe post-re-index, an unrelated side effect of this task's required `npm run rag:index`
  step) that directly affects `HINGLISH_QUERY_FIX_PLAN.md`'s proposed threshold change —
  documented in that file's "READ THIS FIRST" section, not here, since it blocks upcoming
  work rather than anything in this archived task.

## Files

- `TASK-024-hinglish-consistency.md` — the full plan. Read this first.
