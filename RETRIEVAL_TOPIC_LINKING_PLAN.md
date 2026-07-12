# Deterministic Topic→Chunk Linking — Full Audit & Implementation Plan

**Status:** DESIGNED, NOT YET APPROVED FOR IMPLEMENTATION. No product code has been changed. Two throwaway investigation scripts were run against real content (never touched the DB, never touched git-tracked files) and deleted after use.

**Written:** 2026-07-12, after the NEXT_STEP duplicate-content bug was root-caused (see `FOCUS_MODE_PLAN.md`, chapter-01 Light retrieval collision) and before any fix was implemented, per explicit instruction: audit everything first, then present one final plan with reasoning, not another round of "confident but wrong."

---

## Why this document exists

Last time (the July 8 heading restructure), the direct question "will anything break?" was answered confidently and incorrectly — because the check that would have caught the problem (verifying every topic resolves to correct, unambiguous content) didn't exist. This document is that check, done properly, before writing a single line of the actual fix — not after.

Every claim below is backed by either a direct code read or a real, throwaway script run against the actual 16-chapter content set — not assumption. Where a script was run, the exact numbers are given.

---

## Part 1 — The audit: questions asked, answers found

### Q1: Are the Chunker and the Curriculum Builder's outputs conceptually allowed to differ in size/shape?

**Yes — and they should.** The Chunker's job is to produce text pieces sized right for embedding quality (~1200 chars, driven by `DEFAULT_CHUNK_CONFIG.chunkSize`). The Curriculum Builder's job is to produce pedagogically-sized "lessons" for `NEXT_STEP`/progress tracking. These are legitimately different concerns — forcing them to always be the same size would hurt one or the other. This part of the original design is correct and is **not being changed**.

### Q2: Then what exactly is redundant/risky about running them as two independent passes?

**Confirmed by direct code read of both files.** `markdownChunker.js`'s `parseHeadingSections()` and `curriculumIndexBuilder.js`'s `collectHeadingTopics()` are two separately-written functions that both do the same base job — walk the markdown line by line, match `#{1,6}` heading syntax, maintain a heading stack, compute a `headingPath`. They are not literally identical (the curriculum builder additionally classifies a `role` per heading via keyword regexes; the chunker additionally merges/splits by character count) — but the **raw heading-parsing step is duplicated logic with no shared source**, and everything downstream (topic list vs. chunk list) is built from these two independently-derived structures with **zero recorded link between them**. That's the actual redundancy, and it's exactly why two different chapters' worth of drift (BUG-3's topic-count mismatch, and now this retrieval-collision) have both come from the same underlying gap.

### Q3: Does a single embedding chunk ever contain content from more than one core topic? (This is the load-bearing question for the whole fix design.)

**Yes, confirmed empirically — and far more often than the one observed bug suggested.** I instrumented a copy of the actual `mergeSmallSections()` logic to track every original heading-section that gets silently merged into each final chunk (the real code only keeps the *first* merged section's `heading_path` in metadata — everything else it absorbs is invisible in the stored data). I ran this against all 16 real chapter files and cross-referenced every resulting chunk against the real curriculum index's topic roles.

**Result: 87 chunks, across all 16 of 16 chapters, genuinely mix content from two or more different core topics.** Example (Biology, Life Processes): one chunk's text runs from the tail end of "8. Nutrition in Humans" (topics about villi, large intestine) straight into the start of "10. Respiration" — two unrelated core topics, one chunk. This is **not a Light-chapter-specific problem** — it's structural, present everywhere the source content has several short, back-to-back sub-headings.

**Why this matters for the fix:** any design that assumes "one chunk belongs to exactly one topic" is wrong on day one for 87 known chunks. The fix must support **one chunk → multiple topic IDs** (a `topic_ids` array, not a single `topic_id`), and retrieval must query "does this chunk's `topic_ids` array contain the topic I want" — not an exact single-value match.

### Q4: Given chunks can span multiple topics, does linking chunks to topics actually eliminate the observed bug, or just relabel it?

**It eliminates the observed bug, with one honest caveat.** The bug we watched live was: NEXT_STEP for topic 10 retrieved a chunk that had **nothing to do** with topic 10 at all (a distant, unrelated overview paragraph). Deterministic linking closes that completely — a chunk will only ever be returned for a topic query if that topic's content is genuinely present in it.

**The caveat:** for the 87 mixed chunks, when Zuno teaches (say) topic 28, the one chunk tagged with topic 28 *also* contains a few leftover sentences from topic 17 (its immediate predecessor in the merge). The retrieved content will be **correct but not perfectly pure** — a small amount of adjacent-topic text riding along. This is a much milder problem than what we saw live (a completely unrelated topic being taught outright), and it's a pre-existing property of the current chunk boundaries, not something this fix introduces. It's addressed as an optional Phase 2 below, not bundled into the required fix.

### Q5: Will this design correctly handle new subjects/chapters added later, or does it only work for today's 16 files?

**It generalizes, with one condition.** The linking mechanism doesn't hardcode anything about Physics/Chemistry/Biology or specific chapter names — it works purely off heading structure, which every chapter (present or future) already has. The condition: the **audit script** (Part 3 below) must run automatically as part of adding new content and must be allowed to **fail the build** if a new chapter's headings produce an unresolvable topic. That's what makes "future-proof" true in practice rather than just in theory — the guarantee isn't "this can never happen again," it's "this can never reach a student silently again."

### Q6: Does adding a `topic_ids` field to chunk metadata risk breaking any existing consumer?

**Checked every consumer. No breakage found.**
- `sourceFormatter.js` (builds the citation footnotes students see) — reads only `chapter_title`, `heading_path`, `chunk_id`, `section`. Does not touch `topic_ids`. Unaffected.
- `retriever.js` — builds Atlas `$vectorSearch` filters as `metadata.<key>: value`. Adding `metadata.topic_ids` as a new filterable key is additive — existing filters (`subject`, `section`, `chapter_no`) are untouched.
- `chunk.model.js` — `metadata` is `mongoose.Schema.Types.Mixed`. Adding a new key requires no schema migration.
- `indexPipeline.js` — spreads `chunk.metadata` wholesale into the stored document. A new field added inside the chunker's `createChunk()` output flows through automatically, with zero changes needed to `indexPipeline.js` itself.

### Q7: Does this require a full re-index (re-calling the Gemini embedding API for all 628 chunks)?

**No — confirmed twice.** `topic_ids` is pure metadata; it doesn't touch `originalText` (the field that actually gets embedded) or chunk boundaries at all. A live check (2026-07-12) initially looked like it found drift — the real `createMarkdownChunks()` produces 41 chunks for the Light chapter today, matching the live DB's 41 exactly. (An earlier hand-copied analysis script produced 39 and looked like evidence of staleness — that was a bug in the throwaway script, which skipped the `splitSection()` step; re-run with the real, unmodified `parseHeadingSections`/`mergeSmallSections` functions confirmed 41 = 41, zero drift, and the 87-cross-topic-chunk count from Part 1 Q3 was independently re-confirmed identical using the real functions.) The correct migration is a **metadata-only backfill** on the existing `Chunk` documents already in MongoDB — same pattern as `fix-guest-chapter-index.js`. No embeddings are regenerated, no Gemini API cost. `npm run rag:index`'s full re-embed is **not required** for this fix.

### Q7b: Does the Atlas Search filter actually work for a new field like `topic_ids`? (Tested live, 2026-07-12)

**Tested directly against the real Atlas cluster — and it does NOT work out of the box.** Temporarily tagged one real chunk with a test `metadata.topic_ids` value, then ran the exact `$vectorSearch` pipeline `retriever.js` uses, filtering on that field. Result:

```
PlanExecutor error during aggregation :: caused by :: Path 'metadata.topic_ids' needs to be indexed as filter
```

**This is a hard blocker, not a soft risk — confirmed, not guessed.** Atlas Search requires every field used in a `$vectorSearch` filter to be explicitly declared as a filterable field in the index definition (the same reason `subject`/`chapter_no`/etc. work today — they're already declared). There is **no script anywhere in this codebase that creates or manages the Atlas Search index** (`test-search.js` only queries it) — it was set up once, manually, in the Atlas web console. Adding `topic_ids` as a new filterable field requires the same manual action: **someone with Atlas Console access must edit the `vector_index` definition to add `metadata.topic_ids` as a filterable field (type: string, since Atlas Search treats array-of-strings filtering the same as scalar-string filtering) before any of this fix's retrieval code can work.**

The test data itself was cleaned up immediately after (confirmed `topic_ids` removed from the probed document).

**Why this is good news despite being a blocker:** it fails loudly with a clear error, not silently — if this had been discovered only after full implementation, every `NEXT_STEP` call would have errored out in production the moment the new filter code shipped. Finding it now, before writing the retrieval code, converts an unknown risk into a known, actionable prerequisite.

### Q8: What about `CONCEPT_QUESTION` and `EXPLAIN_MORE` — does this fix change their behavior at all?

**No, by design — and this is a deliberate scope boundary, not an oversight.** `CONCEPT_QUESTION` has no resolved topic ID to link against (the student's free-text question is the only input) — it keeps using semantic search exactly as today. `EXPLAIN_MORE` reuses `lastRetrievalQuery`/`lastTopic`, which also isn't always a clean topic ID. Both are already scoped to the focus chapter (via BUG-4's fix) and are untouched by this change. The separate, harder disambiguation problem for these two intents is documented on its own in [`CONCEPT_QUESTION_DISAMBIGUATION.md`](CONCEPT_QUESTION_DISAMBIGUATION.md) and is explicitly not part of this fix.

### Q9: Could this fix ever make things *worse* — e.g., a topic resolving to zero chunks where today it (incorrectly but non-emptily) resolves to something?

**Real risk, must be guarded against — this is exactly what the audit script (Part 3) exists to catch before it ships.** If the constituent-tracking during chunk creation ever misses a topic (e.g., a topic whose heading text appears in the file but never becomes its own tracked constituent due to an edge case in the merge logic), that topic would resolve to zero chunks post-fix, and NEXT_STEP would have nothing to teach for it — a **new, different failure**, potentially worse than today's wrong-content bug because it'd be a hard dead end instead of a wrong-but-present answer. This is the single biggest reason the audit script is not optional — it must run and pass (every one of the ~200+ core topics across 16 chapters resolves to at least one chunk) before this fix is considered safe to ship, not after a student hits a gap.

### Q10: Is there a cheaper option that gets most of the safety without this scope?

Considered and rejected two smaller alternatives, for the record:
- **Content-only patch** (rewrite "Key Concepts"-style overview wording per chapter) — rejected earlier in this conversation; doesn't generalize, doesn't survive future content edits, and the 87-chunk finding shows the underlying pattern is everywhere, not just in wording that could be manually reworded.
- **Reranker heuristic** (penalize low-confidence/close-scoring retrieval) — considered during solution presentation; rejected as a primary fix because it's probabilistic, not deterministic, and wouldn't have prevented the exact bug observed (the wrong chunk scored *clearly* highest, it wasn't a close call the reranker would have caught).

---

## Part 2 — Final design

**One line:** At chunk-creation time, track every curriculum topic ID whose heading content ends up inside each chunk (not just the first one, which is all today's code keeps) — store the full list as `metadata.topic_ids` — and switch `NEXT_STEP` retrieval from "semantically guess the right chunk" to "exactly fetch the chunk(s) tagged with the topic ID we already know we want."

- `topic_ids` is an **array**, because 87 known chunks genuinely belong to more than one core topic.
- Chunks belonging to no core topic at all (practice questions, keyword glossaries, etc.) correctly get an **empty array** — not an error, not a missing field.
- `CONCEPT_QUESTION`/`EXPLAIN_MORE` retrieval is **untouched** — semantic search only, as today.
- No chunk boundaries change, no embeddings are regenerated, no `rag:index` re-run is required — this is a metadata backfill on existing chunks.

---

## Part 3 — The audit script (non-negotiable, ships with the fix, not after it)

A new script (name TBD, e.g. `backend/scripts/verify-topic-chunk-coverage.js`) that, after the backfill, walks every "core" topic in every chapter in `curriculum-index.json` and confirms it resolves to **at least one** chunk via `topic_ids` containment. Fails loudly (non-zero exit, printed list of unresolved topics) if any topic comes up empty. This becomes a required step in the content-update workflow (documented alongside `npm run rag:index` and `npm run curriculum:build` in `CLAUDE.md`'s RAG Commands section) so a future content edit that breaks this mapping is caught at build time, not discovered by a student.

---

## Part 4 — Implementation plan (only starts after explicit go-ahead)

0. **PREREQUISITE, blocks everything else — Atlas Console action (manual, outside this codebase).** Add `metadata.topic_ids` as a filterable field (string type) to the `vector_index` Atlas Search index definition. Confirmed live (Q7b above) that the current code-level filter mechanism errors without this. Nothing in Part 4 below can be verified end-to-end until this is done.
1. **`backend/src/rag/markdownChunker.js`** — modify `mergeSmallSections()` to track every constituent section's `headingPath` per output chunk (not just the first), matching the instrumented logic already verified in the audit above. Add a `resolveTopicIds(constituentHeadingPaths, curriculumChapter)` step in `createChunk()` that maps each constituent to its owning core topic (walking up the heading-path prefix chain, same logic verified in the audit script) and stores the deduplicated result as `metadata.topic_ids`. Requires the chunker to have access to that chapter's already-built curriculum topics at chunk-creation time (new dependency: `curriculumIndexBuilder.js` → `markdownChunker.js`, one direction, no cycle).
2. **`backend/scripts/backfill-chunk-topic-ids.js`** (new, one-time migration, same pattern as `fix-guest-chapter-index.js`) — for every existing `Chunk` document in MongoDB, recompute and write `metadata.topic_ids` without touching `embedding`, `pageContent`, or any other field. Calls `bumpRagVersion()` afterward (existing helper, already used by `indexPipeline.js`) to invalidate any stale cached retrieval results.
3. **`backend/scripts/verify-topic-chunk-coverage.js`** (new, Part 3 above) — run once immediately after the backfill to confirm zero unresolved core topics across all 16 chapters, before this is considered done.
4. **`backend/src/ask/step5.retrieveContent.js`** — `NEXT_STEP` branch: replace `buildTopicSearchQuery()` + semantic `retrieveRelevantChunks()` with a direct filtered fetch on `metadata.topic_ids` containing `result.topic.topicId`, scoped within `focusChapter` as today. `CONCEPT_QUESTION`/`EXPLAIN_MORE` branches are not touched.
5. **`backend/src/rag/retriever.js`** — confirm/extend the metadata-filter builder to support array-containment filtering for the new `topic_ids` key (small, additive change to the existing `filter['metadata.<key>'] = value` pattern already reviewed above).
6. **Testing** — extend `FOCUS_MODE_VERIFICATION_CHECKLIST.md`'s Section B (`NEXT_STEP`) with the now-fixable "decimal sub-topic" and "Light chapter Key Concepts" regression cases; run the existing `test:chunks`/`test:vector-store`/`test:curriculum-resolvers` suites (should pass unchanged — chunk count and embeddings are untouched); live-verify via `verify-focus-mode.js --full` on both the Light chapter and the Chemical Reactions chapter (the two chapters with confirmed live bugs).

**Not in scope for this fix (explicitly deferred, listed so they aren't lost):**
- The 87-chunk content-purity issue (adjacent-topic bleed within a correctly-selected chunk) — optional future Phase 2, would require an actual re-chunk + re-embed since it changes chunk boundaries, not just metadata.
- `CONCEPT_QUESTION` disambiguation — separate, already documented in `CONCEPT_QUESTION_DISAMBIGUATION.md`.

---

## Part 5 — Honest risk/cost summary

| | |
|---|---|
| Gemini API cost | None (metadata-only backfill, no re-embedding) |
| Chunk count / embeddings | Unchanged |
| Existing consumers affected | None found (checked retriever, sourceFormatter, chunk model, indexPipeline) |
| `CONCEPT_QUESTION`/`EXPLAIN_MORE` | Untouched, no behavior change |
| New failure mode this could introduce | A core topic resolving to zero chunks if constituent-tracking misses it — mitigated by the mandatory audit script (Part 3), which must pass before this ships |
| Chapters needing live re-verification | All 16, via the audit script (automatic) + the 2 chapters with confirmed live bugs (Light, Chemical Reactions), via manual/`verify-focus-mode.js` spot check |
| Residual known issue after this fix | 87 chunks with mild adjacent-topic content bleed (Part 4, deferred Phase 2) — much milder than the bug being fixed, not silently reintroducing it |

---

Waiting for explicit go-ahead before touching any code, per this project's standing working-style contract.
