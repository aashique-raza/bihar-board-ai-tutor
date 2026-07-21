/**
 * verify-topic-chunk-coverage.js
 *
 * Non-negotiable safety net for the deterministic topic→chunk linking fix
 * (see RETRIEVAL_TOPIC_LINKING_PLAN.md). Walks every "core" (NEXT_STEP-teachable)
 * topic across all chapters and confirms it resolves to at least one linked chunk.
 *
 * Also flags (WARNING, not a failure) topics with zero EXCLUSIVE chunk — every
 * linked chunk is shared with another core topic. That's the accepted, documented
 * merge-bleed pattern in most cases, but it's also exactly what hid the
 * "revision-keyword poisons nested content" bug (see ROLE_CLASSIFICATION_AUDIT.md):
 * a topic can pass the zero-chunk check above while still teaching almost entirely
 * a neighbor's content. A hard-zero check alone missed that; this doesn't.
 *
 * Run after any content change + `node scripts/backfill-chunk-topic-ids.js`
 * (or `npm run rag:index`, which now computes topic_ids at index time).
 * Exits non-zero and prints the exact unresolved topics if anything is broken —
 * this must be caught here, not discovered by a student mid-chapter.
 *
 * Usage: node scripts/verify-topic-chunk-coverage.js
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { Chunk } from '../src/models/chunk.model.js';
import { loadMarkdownDocuments } from '../src/rag/markdownLoader.js';
import { buildCurriculumIndex } from '../src/curriculum/curriculumIndexBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const run = async () => {
  await connectDB();

  const documents = await loadMarkdownDocuments(baseDataDir);
  const curriculumIndex = buildCurriculumIndex(documents);

  const unresolved = [];
  const noExclusiveContent = [];
  let totalCoreTopics = 0;
  let totalChapters = 0;

  for (const subject of curriculumIndex.subjects) {
    for (const section of subject.sections) {
      for (const chapter of section.chapters) {
        totalChapters += 1;
        const coreTopics = chapter.topics.filter((t) => t.role === 'core');
        for (const topic of coreTopics) {
          totalCoreTopics += 1;
          // eslint-disable-next-line no-await-in-loop
          const linkedChunks = await Chunk.find({ 'metadata.topic_ids': topic.topicId }, { 'metadata.topic_ids': 1 }).lean();
          if (linkedChunks.length === 0) {
            unresolved.push({ topicId: topic.topicId, title: topic.title, chapterId: chapter.chapterId, chapterTitle: chapter.title });
            continue;
          }
          const hasExclusiveChunk = linkedChunks.some((c) => (c.metadata?.topic_ids || []).length === 1);
          if (!hasExclusiveChunk) {
            noExclusiveContent.push({ topicId: topic.topicId, title: topic.title, chapterId: chapter.chapterId, chapterTitle: chapter.title });
          }
        }
      }
    }
  }

  console.log(`Checked ${totalCoreTopics} core topics across ${totalChapters} chapters.\n`);

  if (noExclusiveContent.length > 0) {
    console.warn(`WARNING — ${noExclusiveContent.length} core topic(s) have linked content, but every linked chunk is shared with another core topic (no content exclusively their own):\n`);
    noExclusiveContent.forEach((u) => console.warn(`  [${u.chapterId}] "${u.chapterTitle}" — ${u.topicId}: "${u.title}"`));
    console.warn('\nThese topics may teach mostly a neighbor\'s content. Usually the accepted, documented merge-bleed pattern — but worth a manual look if a topic here was not expected.\n');
  }

  if (unresolved.length > 0) {
    console.error(`FAILED — ${unresolved.length} core topic(s) resolve to ZERO linked chunks:\n`);
    unresolved.forEach((u) => console.error(`  [${u.chapterId}] "${u.chapterTitle}" — ${u.topicId}: "${u.title}"`));
    console.error('\nA student reaching one of these topics via NEXT_STEP would hit an empty-content dead end.');
    console.error('Do not ship the deterministic-linking fix until this is 0.');
    await disconnectDB();
    process.exitCode = 1;
    return;
  }

  console.log('PASSED — every core topic across every chapter resolves to at least one linked chunk.');
  await disconnectDB();
};

run().catch(async (err) => {
  console.error('[verify-topic-chunk-coverage] Failed:', err);
  try { await disconnectDB(); } catch {}
  process.exitCode = 1;
});
