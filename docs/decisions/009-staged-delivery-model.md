# ADR-009: Staged delivery with written exit criteria

- **Date:** 2026-08-28
- **Status:** Accepted

## Context
The project ran for months without ever reaching a finished state. Each round of
work produced improvements *and* a new list of problems, so nothing was ever
"done" and launch kept receding.

Root cause: **there was no written definition of done.** Without a fixed target,
every review reopens the entire project. This is the loop.

A contributing cause: an AI agent has no memory across sessions, so it re-derives
judgment from scratch each time and finds fault with decisions it made itself.
`docs/decisions/` and `AUDIT_RULES.md` address that half.

## Decision
Work is organised into stages. Each stage has a `*_DONE.md` file containing a
checklist. A stage is finished when every box is ticked, and it is **not
reopened** by later review.

| Stage | Goal | Exit file |
|---|---|---|
| 1 — Launch | 20–50 real students use Zuno for a week without breakage | `STAGE1_DONE.md` |
| 2 — Stable | Reliability and cost fundamentals, driven by real usage data | `STAGE2_DONE.md` — *not created yet; written when Stage 1 closes* |
| 3 — Scale | Infrastructure, cost optimisation, new subjects | `STAGE3_DONE.md` — *not created yet* |

Anything not in the current stage's file goes to `BACKLOG.md` and is not worked on.

## Why
- A fixed target is the only thing that makes "finished" possible
- Real user data should drive Stage 2 priorities, not speculation before launch
- Scope creep is what turned a shippable product into an endless loop
- The owner is a junior developer who explicitly asked for senior judgment.
  Bounded scope is part of that judgment

## Rejected alternatives
| Option | Why not |
|---|---|
| Fix everything, then launch | This is what has been attempted for months. It does not terminate |
| Rewrite the Ask pipeline first | Produces better code but pushes launch further out — worsening the actual problem |
| Launch with no checklist | No way to know when to stop |

## Consequences
- **Easy:** work terminates; progress is visible; audits are bounded
- **Hard:** v1 ships with known imperfections — recorded honestly in `BACKLOG.md`
  rather than hidden

## Revisit when
Two full stages complete and the staged model is demonstrably no longer needed.
