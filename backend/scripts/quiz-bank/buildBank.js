/**
 * Quiz Bank — Stage F: dedup + chapter mapping
 *
 * Input:  data/quiz-bank/stage4-answers/<paperId>.json   (Stage E output, immutable, ALL papers)
 * Output: data/quiz-bank/bank/questions.json             (canonical bank, §5.3 shape)
 *         data/quiz-bank/bank/clusters.json               (proposed near-duplicate groups — never auto-merged, A9)
 *         data/quiz-bank/bank/id-ledger.json               (permanent questionId records, §6)
 *
 * Every paper so far is read together (not one at a time) because dedup only means something
 * across papers — "this question appeared in 2016 and 2019" requires seeing both. Right now
 * there is exactly one paper (2016-a, the pilot), so every question is its own group and
 * repeatCount is 1 everywhere. That is expected, not a bug: this stage exists to prove the
 * dedup + chapter-mapping machinery is correct BEFORE it meets 19 more papers where real
 * duplicates will appear (QUIZ_DATA_PIPELINE.md P9).
 *
 * Dedup (A8, A9):
 *   - Exact match = same normalized question text AND (for MCQ) same normalized options.
 *     Exact matches merge into one canonical bank entry automatically.
 *   - Near match = similar but not exact. These are only ever PROPOSED into clusters.json for
 *     a human to look at later (Stage G) — never merged automatically.
 *
 * Chapter mapping: each canonical question's English text is embedded and matched against the
 * same Chunk collection the tutor itself retrieves from. The top chunk's `section` +
 * `chapter_no` metadata (already validated at index time, see markdownLoader.js) is turned
 * directly into a chapterId — e.g. section "Physics" + chapter_no 1 -> "science.physics.chapter-01".
 * This is a fixed formula, not a fuzzy title guess, so it either produces a chapterId or (no
 * chunk found) leaves the question `unmapped` — it never guesses.
 *
 * Both the dedup fingerprints and the chapter lookups are cached to disk (P5) so a re-run with
 * unchanged input makes zero embedding calls and reproduces a byte-identical file.
 *
 * Run: node backend/scripts/quiz-bank/buildBank.js
 *      --dry-run   report canonical/dedup/chapter counts, call nothing, write nothing
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

import { connectDB, disconnectDB } from '../../src/db/mongooseClient.js';
import { Chunk } from '../../src/models/chunk.model.js';
import { createQueryEmbeddings } from '../../src/rag/geminiEmbeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const ANSWERS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage4-answers');
const BANK_DIR = path.join(REPO_ROOT, 'data/quiz-bank/bank');
const QUESTIONS_OUT_PATH = path.join(BANK_DIR, 'questions.json');
const CLUSTERS_OUT_PATH = path.join(BANK_DIR, 'clusters.json');
const LEDGER_PATH = path.join(BANK_DIR, 'id-ledger.json');
const CHAPTER_CACHE_PATH = path.join(BANK_DIR, '_chapter-cache.json');

const SCHEMA_VERSION = 1;

// Bumped whenever the chapter-lookup query shape changes in a way that should invalidate
// previous results (e.g. a different topK). Part of the cache key.
const CHAPTER_MAP_VERSION = 1;

// Best chunk only — chapter classification wants the single nearest topic, not several
// candidates to rerank (unlike buildAnswers.js, which needs breadth for answer verification).
const CHAPTER_LOOKUP_TOP_K = 3;

// Two questions with the same normalized-token overlap at or above this are proposed as a
// near-duplicate cluster (A9). Conservative on purpose: this only ever proposes, never merges,
// so the cost of a false positive is a human glancing at two questions in Stage G, not a
// silently wrong merge.
const NEAR_DUP_JACCARD_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// text normalization (A8 exact-match key, A9 near-dup similarity)
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace. Numbers are kept — "Cn H2n" and
 * "100 W - 220 V" mean different things than their digit-stripped versions would. */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A8: identity is text AND options together — two questions with the same stem but
 * different options are NOT the same question. Subjective questions (no options) match on
 * text alone.
 *
 * Falls back to Hindi when English is missing (some subjective/short-answer questions never
 * got a `text.en` from Stage D) — without this, every English-missing question normalizes to
 * the same empty string and falsely merges into one canonical entry, silently discarding all
 * but one of them. */
function questionFingerprint(question) {
  const textPart = normalizeText(question.text?.en || question.text?.hi);
  if (question.type !== 'mcq' || !Array.isArray(question.options)) return textPart;
  const optionsPart = question.options.map((o) => normalizeText(o.text?.en)).join('|');
  return `${textPart}::${optionsPart}`;
}

function tokenSet(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function jaccard(setA, setB) {
  const intersectionSize = [...setA].filter((token) => setB.has(token)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ---------------------------------------------------------------------------
// id ledger (P6 — questionId assigned once, never reused, never renumbered)
// ---------------------------------------------------------------------------

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return {};
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')).entries || {};
}

/** Reuses a fingerprint's existing questionId if the ledger already has one; otherwise
 * assigns the next free number. Entries already in the ledger are never touched, so a
 * fingerprint that stops appearing in a later run still keeps its number reserved (P6). */
function assignQuestionIds(fingerprints, existingLedger) {
  const ledger = { ...existingLedger };
  const fingerprintToId = new Map();

  for (const [id, entry] of Object.entries(ledger)) {
    fingerprintToId.set(entry.fingerprint, id);
  }

  let nextNumber = Object.keys(ledger).reduce((max, id) => {
    const n = Number.parseInt(id.replace('q-', ''), 10);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0) + 1;

  const result = new Map();
  for (const { fingerprint, firstSourceId } of fingerprints) {
    let id = fingerprintToId.get(fingerprint);
    if (!id) {
      id = `q-${String(nextNumber).padStart(6, '0')}`;
      nextNumber += 1;
      ledger[id] = { fingerprint, firstSourceId };
      fingerprintToId.set(fingerprint, id);
    }
    result.set(fingerprint, id);
  }

  return { questionIdByFingerprint: result, ledger };
}

// ---------------------------------------------------------------------------
// chapter mapping — direct vector search, own cache (P5)
// ---------------------------------------------------------------------------

function chapterCacheKey(queryText) {
  return crypto
    .createHash('sha256')
    .update(`v${CHAPTER_MAP_VERSION} | ${normalizeText(queryText)}`)
    .digest('hex')
    .slice(0, 16);
}

function loadChapterCache() {
  if (!fs.existsSync(CHAPTER_CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CHAPTER_CACHE_PATH, 'utf8')).entries || {};
}

function saveChapterCache(entries) {
  fs.mkdirSync(BANK_DIR, { recursive: true });
  fs.writeFileSync(CHAPTER_CACHE_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, entries }), 'utf8');
}

/** Nearest chunk's `section` + `chapter_no` metadata, turned into a chapterId by the same
 * fixed formula the curriculum index uses (science.<section>.chapter-<NN>) — not a fuzzy
 * title match. No chunk found = unmapped, never guessed. */
async function classifyChapter(embeddings, queryText, cache, stats) {
  const key = chapterCacheKey(queryText);
  if (cache[key]) {
    stats.chapterCacheHit += 1;
    return cache[key];
  }

  const queryVector = await embeddings.embedQuery(queryText);
  stats.chapterLookups += 1;

  const results = await Chunk.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 50,
        limit: CHAPTER_LOOKUP_TOP_K,
      },
    },
    { $project: { _id: 0, metadata: 1, score: { $meta: 'vectorSearchScore' } } },
  ]);

  let result;
  if (!results.length) {
    result = { chapterId: null, confidence: 0, method: 'rag' };
  } else {
    const top = results[0];
    const section = top.metadata?.section;
    const chapterNo = top.metadata?.chapter_no;
    const chapterId = section && Number.isInteger(chapterNo)
      ? `science.${section.toLowerCase()}.chapter-${String(chapterNo).padStart(2, '0')}`
      : null;
    result = { chapterId, confidence: Number(top.score.toFixed(4)), method: 'rag' };
  }

  cache[key] = result;
  saveChapterCache(cache); // after every lookup — an interrupted run keeps what it paid for
  return result;
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

/** Sorted keys, no timestamps — a re-run with unchanged input produces a byte-identical
 * file (P5). Same helper as the other quiz-bank stages. */
function stableStringify(value) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortKeys(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** Stage E's paper object does not carry a `year` field in the pilot output, and per P3
 * ("filename hi identity ka sach hai") an internal field would not be trusted anyway even if
 * present — paperId itself (e.g. "2016-a") is the source of truth for year. */
function parseYearFromPaperId(paperId) {
  const match = /^(\d{4})/.exec(paperId || '');
  return match ? Number.parseInt(match[1], 10) : null;
}

function loadAllPapers() {
  if (!fs.existsSync(ANSWERS_DIR)) return [];
  return fs
    .readdirSync(ANSWERS_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(ANSWERS_DIR, f), 'utf8')));
}

/** Among questions sharing a fingerprint, the "best" one becomes the canonical version:
 * highest answer confidence first, then earliest paperId for a deterministic tie-break. */
function pickCanonical(group) {
  const confidenceRank = { L4: 4, L3: 3, L2: 2, L1: 1, L0: 0 };
  return [...group].sort((a, b) => {
    const rankDiff = (confidenceRank[b.question.answer.confidence] || 0) - (confidenceRank[a.question.answer.confidence] || 0);
    if (rankDiff !== 0) return rankDiff;
    return a.paperId.localeCompare(b.paperId);
  })[0];
}

async function build(options) {
  const papers = loadAllPapers();
  if (!papers.length) {
    throw new Error(`No papers found in ${ANSWERS_DIR} — run Stage E first.`);
  }

  // Flatten every question from every paper, tagged with its paper's year/id.
  const entries = [];
  for (const paper of papers) {
    for (const question of paper.questions) {
      const year = paper.paper.year ?? parseYearFromPaperId(paper.paper.paperId);
      entries.push({ paperId: paper.paper.paperId, year, subject: paper.paper.subject, question });
    }
  }

  // A8 — exact-match grouping by fingerprint.
  const groups = new Map();
  for (const entry of entries) {
    const fingerprint = questionFingerprint(entry.question);
    if (!groups.has(fingerprint)) groups.set(fingerprint, []);
    groups.get(fingerprint).push(entry);
  }

  const stats = {
    totalQuestions: entries.length,
    canonicalEntries: groups.size,
    exactMerges: entries.length - groups.size,
    chapterLookups: 0,
    chapterCacheHit: 0,
    mapped: 0,
    unmapped: 0,
  };

  if (options.dryRun) {
    console.log(`  total questions (all papers): ${stats.totalQuestions}`);
    console.log(`  canonical entries after exact-match dedup: ${stats.canonicalEntries}`);
    console.log(`  exact-match merges: ${stats.exactMerges}`);
    console.log('  (dry run — no chapter lookups, no writes)');
    return stats;
  }

  // A9 — near-duplicate proposals, same-section pairs only, never merged.
  const canonicalList = [...groups.entries()]; // [fingerprint, group][]
  const clusters = [];
  for (let i = 0; i < canonicalList.length; i += 1) {
    for (let j = i + 1; j < canonicalList.length; j += 1) {
      const [fpA, groupA] = canonicalList[i];
      const [fpB, groupB] = canonicalList[j];
      const qA = groupA[0].question;
      const qB = groupB[0].question;
      if (qA.section !== qB.section) continue;

      const similarity = jaccard(tokenSet(qA.text.en), tokenSet(qB.text.en));
      if (similarity >= NEAR_DUP_JACCARD_THRESHOLD) {
        clusters.push({ fingerprints: [fpA, fpB], similarity: Number(similarity.toFixed(3)) });
      }
    }
  }

  // id-ledger — assign/reuse questionId per fingerprint (P6).
  const existingLedger = loadLedger();
  const fingerprintList = canonicalList.map(([fingerprint, group]) => {
    const sortedGroup = [...group].sort((a, b) => a.question.sourceId.localeCompare(b.question.sourceId));
    return { fingerprint, firstSourceId: sortedGroup[0].question.sourceId };
  });
  const { questionIdByFingerprint, ledger } = assignQuestionIds(fingerprintList, existingLedger);

  // chapter mapping — one lookup per canonical entry.
  const embeddings = createQueryEmbeddings();
  const chapterCache = loadChapterCache();

  const bankQuestions = [];
  for (const [fingerprint, group] of canonicalList) {
    const best = pickCanonical(group);
    const questionId = questionIdByFingerprint.get(fingerprint);

    const appearances = [...group]
      .sort((a, b) => a.question.sourceId.localeCompare(b.question.sourceId))
      .map((e) => ({
        paperId: e.paperId,
        sourceId: e.question.sourceId,
        year: e.year,
        marks: e.question.marks,
      }));
    const years = [...new Set(appearances.map((a) => a.year))].sort((a, b) => a - b);

    const chapterQueryText = best.question.text.en || best.question.text.hi;
    const chapter = chapterQueryText
      ? await classifyChapter(embeddings, chapterQueryText, chapterCache, stats)
      : { chapterId: null, confidence: 0, method: 'rag' };

    if (chapter.chapterId) stats.mapped += 1;
    else stats.unmapped += 1;

    const canonical = { ...best.question };
    if (!chapter.chapterId) {
      canonical.flags = [...new Set([...(canonical.flags || []), 'chapter-unmapped'])].sort();
    }

    bankQuestions.push({
      questionId,
      canonical,
      appearances,
      repeatCount: appearances.length,
      years,
      variants: [],
      chapter,
      difficulty: null,
      usableInQuiz: canonical.usableInQuiz,
    });
  }

  bankQuestions.sort((a, b) => a.questionId.localeCompare(b.questionId));

  fs.mkdirSync(BANK_DIR, { recursive: true });
  fs.writeFileSync(QUESTIONS_OUT_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, questions: bankQuestions }), 'utf8');
  fs.writeFileSync(
    CLUSTERS_OUT_PATH,
    stableStringify({
      schemaVersion: SCHEMA_VERSION,
      clusters: clusters.map((c, i) => ({
        clusterId: `c-${String(i + 1).padStart(4, '0')}`,
        reason: 'near-duplicate text (proposed, not merged)',
        similarity: c.similarity,
        members: c.fingerprints.map((fp) => questionIdByFingerprint.get(fp)),
      })),
    }),
    'utf8'
  );
  fs.writeFileSync(LEDGER_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, entries: ledger }), 'utf8');

  stats.clusters = clusters.length;
  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (!dryRun) await connectDB();

  let stats;
  try {
    stats = await build({ dryRun });
  } finally {
    if (!dryRun) await disconnectDB();
  }

  if (!dryRun) {
    console.log(`total questions (all papers): ${stats.totalQuestions}`);
    console.log(`canonical entries after exact-match dedup: ${stats.canonicalEntries}`);
    console.log(`exact-match merges: ${stats.exactMerges}`);
    console.log(`near-duplicate clusters proposed: ${stats.clusters}`);
    console.log(`chapter lookups: ${stats.chapterLookups}  cache hits: ${stats.chapterCacheHit}`);
    console.log(`chapter mapped: ${stats.mapped}  unmapped: ${stats.unmapped}`);
    const mappedPct = ((stats.mapped / stats.canonicalEntries) * 100).toFixed(1);
    console.log(`chapter mapped %: ${mappedPct}%`);
    console.log('');
    console.log(`written: ${path.relative(REPO_ROOT, QUESTIONS_OUT_PATH).replace(/\\/g, '/')}`);
    console.log(`written: ${path.relative(REPO_ROOT, CLUSTERS_OUT_PATH).replace(/\\/g, '/')}`);
    console.log(`written: ${path.relative(REPO_ROOT, LEDGER_PATH).replace(/\\/g, '/')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
