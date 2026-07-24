# Archived — Focus Mode Planning Files

Focus Mode's stabilization effort (root cause audit → fix → verify, started 2026-07-06)
is **DONE**. All confirmed bugs are fixed and verified. This folder is the permanent
historical record — kept for reference, not the current source of truth for active work.

**Start with [`FOCUS_MODE_PLAN.md`](FOCUS_MODE_PLAN.md)** — the consolidated master log
(architecture decisions, every bug's root cause, fix, and verification, in full detail).
Its own "Superseded Decisions" section explains where it overrides the 3 original files
below it in this folder.

## ⚠️ One item here is NOT done — still open

`CONCEPT_QUESTION_DISAMBIGUATION.md` describes a **structural risk, not a confirmed bug**
(a student's free-text question can be ambiguous between 2+ topics with overlapping
titles in the same chapter). It was deliberately deferred, not fixed. It's archived here
because it was found during Focus Mode's audit and is referenced from
`FOCUS_MODE_PLAN.md`'s "Open/Remaining Work" table — but don't mistake its presence in
this folder for "resolved." Needs its own deep-discussion phase before any fix is designed.

## Files

- `FOCUS_MODE_PLAN.md` — the consolidated master log. Read this first.
- `FOCUS_MODE_VERIFICATION_CHECKLIST.md` — the file-by-file audit checklist (sections A-H) that the automated `verify-focus-mode.js` script is built against.
- `RETRIEVAL_TOPIC_LINKING_PLAN.md` — design doc for Phase I (deterministic topic→chunk linking, fixes the NEXT_STEP duplicate-content bug class).
- `ROLE_CLASSIFICATION_AUDIT.md` — Phase I's companion audit (`getTopicRole()` ancestry-path bug, Option D fix).
- `CONCEPT_QUESTION_DISAMBIGUATION.md` — **still open, not fixed.** See warning above.
- `FOCUS_MODE_MASTER_PLAN.md` — original 16-step task list (STEP-1 to STEP-16), historical raw record.
- `FOCUS_MODE_DB_ARCHITECTURE.md` — design doc for the `chapter_progress` cross-session DB layer, historical raw record.
- `FOCUS_MODE_PROGRESS_FIX_PLAN.md` — the actual, verified fix for the two-progress-systems bug, historical raw record.
