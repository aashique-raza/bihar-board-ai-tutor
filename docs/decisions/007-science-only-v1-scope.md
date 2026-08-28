# ADR-007: Science only for v1 — no other subjects

- **Date:** 2026-08-28
- **Status:** Accepted

## Context
Bihar Board Class 10 has six subjects. Zuno has content for one: Science
(17 chapter files, 1,126 quiz questions). The stated long-term goal covers a
student's whole exam preparation.

## Decision
**v1 ships with Science only.** Maths, Hindi, English, Social Science, and
Sanskrit are deferred to Stage 3.

## Why
- The Science brain is not yet performing well enough (owner's own assessment).
  Six subjects would multiply every unresolved problem by six
- Content, retrieval tuning, quiz banks, and exam data all scale per subject —
  six subjects is roughly six times the work and six times the running cost
- **Science is the subject Bihar Board students most often fail.** Highest
  impact per unit of effort
- "Zuno — Bihar Board Class 10 Science ka personal tutor" is a clear, credible
  product. A six-subject Zuno that is thin everywhere is not
- One subject done excellently is a better proof point for growth than six done
  partially

## Rejected alternatives
| Option | Why not |
|---|---|
| Launch all six | Content does not exist; months of delay before any real-user learning |
| Add Maths now | Doubles surface area before Science is validated |

## Consequences
- **Easy:** focused positioning, manageable cost, faster iteration
- **Hard:** limits the addressable audience. Some students will ask for other
  subjects — the `OUT_OF_CONTEXT` intent already handles this honestly

## Revisit when
Science has 1,000+ satisfied daily users and its quality metrics are stable.
Maths first.
