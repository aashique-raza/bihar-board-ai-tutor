# Deep Audit — "Revision-keyword poisons nested teaching content" bug

**Status:** ✅ OPTION D IMPLEMENTED AND VERIFIED (2026-07-21). Folded directly into `resolveTopicIdsForConstituents()` in `markdownChunker.js` as part of the same commit as `RETRIEVAL_TOPIC_LINKING_PLAN.md`'s fix, not a separate pass. See that file's "Part 6 — Implementation Verified" for the closing evidence: the severe Light-chapter case (`topic-14`, "Part 2: Spherical Mirrors") no longer appears in `verify-topic-chunk-coverage.js`'s warning list, consistent with the fix working — though not confirmed by a live conversation this session (flagged as an open gap there, not hidden here).

Every number below is from a throwaway script run against the real 16-chapter content + live MongoDB — no assumptions. Scripts deleted after use.

**Written:** 2026-07-12, after live browser testing (Farhan) surfaced repeated/overlapping content on turns 1–3 of the Light chapter, following the deterministic topic→chunk linking fix (`RETRIEVAL_TOPIC_LINKING_PLAN.md`).

**Why this doc exists:** I was asked to deep-audit my proposed "Option C" (content rename) BEFORE implementing, because a previous fix was declared safe and turned out not to be. The audit found Option C itself rests on a false premise, and that a fourth option not in my original three is materially better. This is that finding, with evidence.

---

## 1. What the bug actually is (precise, evidence-backed)

`curriculumIndexBuilder.js`'s `getTopicRole()` calls `isRevisionHeading(headingPath)` on the **full heading path**, not the heading's own title. So a revision keyword (`important`, `formula`, `definition`, `exam`, `unit`, …) appearing **anywhere in the ancestry** marks a heading — and its entire subtree — as `revision`, which excludes it from being any core topic's content.

This is **correct** for chapter-end appendices (e.g. `Chapter > Important Definitions`), but **wrong** when a keyword-named subsection sits *inside* an active teaching section — because then real teaching content gets excluded.

**The concrete failure (Light chapter):** `## Important Terms Related to Spherical Mirrors` is an H2 nested under `# Part 2: Spherical Mirrors`. Because its title contains "Important", it AND its whole subtree — **Ray Rules 1–4, Image Formation by Concave/Convex Mirror, Uses of Mirrors (3249 chars of core teaching content)** — were classified `revision` and linked to NO core topic. So `topic-14 "Part 2: Spherical Mirrors"` had almost none of its own content; NEXT_STEP for it fell back to a chunk shared with `topic-10` (Laws of Reflection). That is exactly the repetition seen in the browser test.

**This is a pre-existing bug, not caused by the linking fix.** The old semantic-search path masked it (it loosely matched *something*); the new deterministic path exposes it by design.

---

## 2. True scope (correcting a misleading number I gave earlier)

I earlier said "63/211 core topics affected." **That number conflated two different things and overstated the bug.** Verified breakdown:

- **"Starved" = a core topic with no chunk *exclusively* its own: 63/211.** But `hasAnyLinkedChunk=true` for all of them — their own content IS present, just in a chunk **shared with an adjacent topic**. That is the **already-documented, already-accepted merge-bleed** (the 87-chunk finding in `RETRIEVAL_TOPIC_LINKING_PLAN.md` Q3/Q4), where content is *correct but not pure*. It is NOT this bug.
- **Genuinely affected by THIS bug (own content excluded as `revision`, so the topic gets a chunk containing a *neighbour's* content, not its own): 9 topics**, found by cross-referencing "starved" against "has a revision/practice child nested under an active core section."

**Severity of the 9, by characters of content wrongly excluded:**

| Topic | Chapter | Chars excluded | Severity |
|---|---|---|---|
| Part 2: Spherical Mirrors | Light | **3249** | SEVERE — whole Ray Rules / Image Formation / Uses subtree (the observed bug) |
| 8. Functional Groups | Carbon | 339 | minor |
| 7. Resistivity ("Important Points") | Electricity | 306 | minor |
| 10. Resistors in Parallel | Electricity | 249 | minor |
| 9. Resistors in Series | Electricity | 205 | minor |
| 6. Factors Affecting Resistance | Electricity | 151 | trivial |
| 7. Resistivity ("SI Unit") | Electricity | 42 | trivial |
| 17. Ethanol ("Formula") | Carbon | 34 | trivial |
| 18. Ethanoic Acid ("Formula") | Carbon | 16 | trivial |
| 9. Occurrence of Metals ("Important Terms") | Metals | 0 (empty heading) | none |

**≈94% of the total excluded content is one heading in one chapter (Light).** The rest are one-or-two-line facts. Root reason: **only the Light chapter uses the `# Part N:` structure that places `## Important Terms…` H2 subsections *inside* an active teaching section.** Across all 16 chapters there are only **4 H1/H2-level** trigger headings nested under an active core section, all in Light; the other 15 chapters keep their "Important X" sections as standalone chapter-end appendices (150 of them — correctly classified).

---

## 3. Real-user / data impact (verified against live MongoDB)

- Total `ChapterProgress` docs in the whole database: **13** — all test data (Farhan's account + synthetic guest IDs). **Zero real production users.**
- The two Light-chapter docs already disagree: one has `totalCoreTopics=37` (stale, from before BUG-3), one has `9`. So `totalCoreTopics` is snapshotted per-write and **already drifts** — any option that changes it just needs a test-data reset, which has been done before.

**Conclusion:** progress-migration risk is effectively nil right now (pre-launch, disposable test data). This makes it the cheapest possible time to change topic structure IF an option requires it — but it is NOT a reason to prefer an option that needlessly does.

---

## 4. The options — re-evaluated with evidence (my original 3 were wrong)

### Option A / C — content rename (`Important Terms…` → `Terms and Rules…`)
**I previously called this "5-min, zero-risk, cosmetic." Simulation proves that was false.** Renaming removes the keyword from an **H2**, which promotes it from `revision` to `core` → it becomes **its own new core topic**. Verified: Light goes **9 → 11 core topics**; NEXT_STEP sequence gains `topic-18` and `topic-65`; `totalCoreTopics` changes.
- **Requires:** content edit **+ `curriculum:build`** (rebuild the stored 1.8 MB `curriculum-index.json`) **+ `rag:index`** (heading text is part of embedded content) **+ backfill + coverage audit + test-data reset.** Not cosmetic, not 5 minutes.
- **Fixes only the 1 severe case.** Leaves the 8 minor ones. Does **not** prevent recurrence in a future chapter authored the same way.
- **Verdict: rejected** — expensive, incomplete, not future-proof, and based on a premise the audit falsified.

### Option B — classification change (`getTopicRole` checks own title, not full path)
- **Verified regression risk:** practice questions (`### 1. What is diffusion?`) have clean own-titles but sit under `Short Answer Questions`. Checking own-title-only flips them from `practice` to `subtopic` → **exam Q&A gets pulled into teachable content.** 795 currently-excluded headings have clean own-titles; an unknown subset are practice questions that would wrongly become teaching material.
- Would need careful per-role logic to be safe. High blast radius on 150+ currently-correct classifications.
- **Verdict: rejected** — real regression, disproportionate risk.

### Option D — linking-layer fix (NOT in my original three; the correct answer)
Change **only** `resolveTopicIdsForConstituents()` (the function added in the linking fix): when climbing a chunk-constituent's heading-path to find its owning core topic, **do not stop at a `revision`/`practice`/`reference` node — keep climbing to see if a `core` ancestor exists above it.** If yes, link to it. If no core ancestor (chapter-level appendix), behaviour is unchanged.

**Verified properties (all by simulation against real content):**
- **0 regressions** — no chunk's existing core link is changed; Option D only *adds* missing links (75 section-links across 9 chapters), never redirects an existing one.
- **0 practice/exam content wrongly pulled in** — chapter-level appendices (Short Answer Questions, Exam-Focused Points, Important Definitions) have no `core` ancestor, so they stay unlinked, exactly as today.
- **Fixes the severe Light case** — `topic-14` gains its real Ray Rules / Image Formation / Uses content (drops off the starved list).
- **Also fixes the 8 minor cases** for free (their content links up to the enclosing core topic).
- **No NEXT_STEP over-fetch** — max chunks-per-topic stays **6**, identical to today (the 47 newly-linked Light sections merge into a handful of chunks).
- **Does not touch** CONCEPT_QUESTION / semantic search (they never use `topic_ids`), role classification, topic IDs, topic counts, `curriculum-index.json`, or embeddings.
- **Requires only:** ~5-line code change + re-run `backfill-chunk-topic-ids.js` (recompute `topic_ids`, no re-embed) + re-run `verify-topic-chunk-coverage.js`. No `rag:index`, no `curriculum:build`, no Gemini cost.
- **Future-proof:** robust to the "revision-keyword nested in an active section" authoring pattern for all current and future chapters — the systemic fix, not a per-file patch.

**One accepted imperfection (same class as merge-bleed, not new):** Option D links genuinely revision-flavoured content (e.g. an "Exam Point" under Part 4 Refraction) into its enclosing core topic. Verified this is always on-topic (nearest-core-ancestor only, no cross-Part contamination) — it means "when teaching Refraction, include the refraction exam point," which is desirable, not a defect.

---

## 5. Recommendation

**Option D.** My original three options anchored on content-editing and heavy classification-surgery and recommended the one (C) that the audit proved to be secretly expensive and incomplete. The evidence points to a linking-layer fix that is smaller, zero-regression (proven), fixes all 9 cases including the severe one, needs no re-embed/rebuild, and is future-proof.

**Residual honesty:** the 61 merge-bleed topics (shared-but-correct chunks) remain as they are — that is the pre-existing, separately-accepted phenomenon documented in `RETRIEVAL_TOPIC_LINKING_PLAN.md`, not part of this bug, and not something Option D needs to solve.

---

## 6. If Option D is approved — implementation + verification plan

1. `backend/src/rag/markdownChunker.js` — in `resolveTopicIdsForConstituents()`, remove the early `return null` on a non-core/non-subtopic ancestor; continue climbing to the nearest `core` ancestor (chapter-level appendices still resolve to null → empty `topic_ids`). ~5 lines.
2. Re-run `node scripts/backfill-chunk-topic-ids.js` (metadata-only, no re-embed).
3. Re-run `node scripts/verify-topic-chunk-coverage.js` — must stay PASS (Option D only adds links).
4. **Live browser re-test the exact Light-chapter flow Farhan ran** — turns 1–4 must now teach Reflection → Spherical Mirrors (Ray Rules/Image Formation/Uses) → Sign Convention as distinct content, no repetition. Plus a spot-check on Chemical Reactions (BUG-6 decimal topics).
5. Reset the handful of stale test `ChapterProgress` docs so `totalCoreTopics` snapshots are current (optional; test data only).
