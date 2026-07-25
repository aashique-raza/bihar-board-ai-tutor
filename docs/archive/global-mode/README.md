# Archived — Global Mode Planning Files

Global Mode's stabilization effort (root cause audit → fix → verify, started 2026-07-24,
same day Focus Mode's stabilization finished) is **DONE**. All findings are either fixed
and verified, or were deep-audited and found to require no code change under the current
architecture. This folder is the permanent historical record — kept for reference, not
the current source of truth for active work.

**Start with [`GLOBAL_MODE_VERIFICATION_CHECKLIST.md`](GLOBAL_MODE_VERIFICATION_CHECKLIST.md)**
— the full file-by-file audit (sections A-G, findings A1-G2), with every claim traced to
exact file:line evidence, plus a v3 changelog showing what was fixed vs. what was
re-evaluated and downgraded, and why.

## Status summary (as of 2026-07-25)

- 🔴 **2 High findings, both fixed**: A2/E1 — cross-mode session-state corruption when a
  student switches focus↔global mid-session. Fixed with a mode-mismatch guard in
  `step2.loadSession.js`.
- 🟡 **3 Medium findings, fixed**: B1/B2 — NEXT_STEP firing with no chapter in Global Mode
  (fixed via a deterministic `intentRouter.js` short-circuit). G1 — no automated
  regression script for Global Mode (fixed: `backend/scripts/verify-global-mode.js`,
  still lives in `backend/scripts/`, not archived — it's an active test, not a planning doc).
- 🟢 **6 findings downgraded after deep audit, no fix needed**: A1, C2, C3, E2, F1, F2 —
  each was traced against the *live* code path (not assumptions) and found to either
  already be closed by an earlier fix, or to be a deliberate favorable tradeoff, not an
  oversight. Full reasoning for each is in the checklist itself.
- 🟡 **1 finding, documented fragility, no fix planned**: D1 — works in practice, would
  only be worth revisiting if it causes an observed issue.

**Nothing was deferred or left open.** Unlike Focus Mode's archive (which has one
still-open item, `CONCEPT_QUESTION_DISAMBIGUATION.md`), Global Mode's audit closed out
every finding.

## Files

- `GLOBAL_MODE_VERIFICATION_CHECKLIST.md` — the full audit. Read this first.

## Related, not archived

- `backend/scripts/verify-global-mode.js` — the automated regression script this audit's
  G1 fix produced. Stays live in `backend/scripts/` (same as `verify-focus-mode.js` and
  `verify-session-mode-guard.js`) — run it after any future change to shared pipeline code.
