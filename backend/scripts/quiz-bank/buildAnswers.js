/**
 * Quiz Bank — Stage E: answers + verification
 *
 * Input:  data/quiz-bank/stage3-questions/<paperId>.json   (Stage D output, immutable)
 * Output: data/quiz-bank/stage4-answers/<paperId>.json     (QUIZ_DATA_PIPELINE.md §5.2 shape)
 *
 * This paper has no printed answer key, and it is the only paper processed so far, so there
 * is no second year's verified answer to repeat-match against either (QUIZ_DATA_PIPELINE.md
 * §7 Stage E, source order). The one source left is the textbook: for every objective MCQ,
 * this script asks Zuno's own RAG retriever for the relevant passage in
 * data/class-10/science/, then asks an LLM to decide the correct option using ONLY that
 * passage — the same "never answer outside the retrieved source" rule the tutor itself must
 * follow (CLAUDE.md). Per §9, a textbook-verified answer alone is enough for L3
 * (quiz-eligible); it does not need a second corroborating source.
 *
 * The marks pencilled onto the scanned pages are NEVER used here — §3.1 F3 found them ~45%
 * wrong. If the retriever finds nothing, or the LLM cannot support an option from what it
 * found, the question is left unanswered (`source: "none"`, blocker `answer-unverified`)
 * rather than guessed. Subjective questions are untouched — model answers for those are a
 * later, separate pass (QUIZ_DATA_PIPELINE.md §13 D3).
 *
 * The verification call is cached (P5): a second run with the same retrieved evidence makes
 * zero LLM calls and reproduces a byte-identical file. If the RAG index changes and a
 * question's evidence changes with it, that question's cache entry misses and is redone.
 *
 * A human can also confirm an answer the textbook couldn't settle — via
 * data/quiz-bank/review/resolved.json (QUIZ_DATA_PIPELINE.md §10). That file is never
 * touched by this script and never gets wiped by a re-run (P4); any question listed there is
 * taken on the human's word (`source: "human"`, confidence L4) and skips retrieval/LLM
 * entirely — a human decision is not something automation should second-guess.
 *
 * Run: node backend/scripts/quiz-bank/buildAnswers.js [paperId ...]
 *      (no argument = every paper that has a stage3-questions file)
 *      --dry-run   report objective/subjective counts, call nothing, write nothing
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';

import { connectDB, disconnectDB } from '../../src/db/mongooseClient.js';
import { retrieveRelevantChunks } from '../../src/rag/retriever.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const QUESTIONS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage3-questions');
const ANSWERS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage4-answers');
const CACHE_PATH = path.join(ANSWERS_DIR, '_verification-cache.json');
const RESOLVED_PATH = path.join(REPO_ROOT, 'data/quiz-bank/review/resolved.json');

const SCHEMA_VERSION = 1;
const OPTION_KEYS = ['a', 'b', 'c', 'd'];

/** Wider than the tutor's own default (5). The tutor optimizes for latency on a single live
 * answer; this script is building ground-truth data offline, so it can afford to look further
 * down the ranked list. Pilot run found a case where the one unambiguous textbook sentence
 * ranked 8th, behind several indirect comparison tables — narrower recall would have missed it. */
const VERIFICATION_TOP_K = 8;

/** Bumped whenever SYSTEM_PROMPT changes in a way that should change its verdicts. Part of
 * the cache key, same reasoning as buildQuestions.js's PROMPT_VERSION.
 *
 * v2: pilot run caught a real wrong-answer case (2016-a:B:31-ii). Five excerpts were
 * retrieved, all textbook-correct, but the clearest one was a two-column comparison table
 * ("Convex Mirror | Concave Lens" ... "Used in spectacles for myopia" under the Concave Lens
 * column). The model misread the column alignment and confidently answered "Convex" — a
 * paraphrased "quote" that does not actually appear anywhere in the source. v2 requires a
 * verbatim quote (checked in code, not trusted from the model) and explicitly warns about
 * table column/row mixups. */
const PROMPT_VERSION = 2;

// ---------------------------------------------------------------------------
// Verification cache (P5)
// ---------------------------------------------------------------------------

/** Keyed on the source id AND the retrieved evidence (chunk ids + scores), not just the
 * question text. If the RAG index is ever rebuilt and a question's evidence changes, its
 * cache entry misses on purpose — a verdict is only valid for the evidence it was given. */
function cacheKey(sourceId, retrievalResults) {
  const evidenceSignature = retrievalResults.map((r) => `${r.id}:${r.score.toFixed(3)}`).join(',');
  return crypto
    .createHash('sha256')
    .update(`v${PROMPT_VERSION} | ${sourceId} | ${evidenceSignature}`)
    .digest('hex')
    .slice(0, 16);
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')).entries || {};
}

function saveCache(entries) {
  fs.mkdirSync(ANSWERS_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, entries }), 'utf8');
}

// ---------------------------------------------------------------------------
// Human review decisions (P4, QUIZ_DATA_PIPELINE.md §10) — read-only from this script's
// point of view. This file is hand-maintained and must never be written by a pipeline stage.
// ---------------------------------------------------------------------------

/** Map of sourceId -> decision, for field "answer.correctOption" only (the only field this
 * stage produces). Missing file is normal (no human overrides yet), not an error. */
function loadResolvedDecisions() {
  if (!fs.existsSync(RESOLVED_PATH)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(RESOLVED_PATH, 'utf8'));
  const decisions = new Map();
  for (const d of parsed.decisions || []) {
    if (d.field === 'answer.correctOption' && OPTION_KEYS.includes(d.value)) {
      decisions.set(d.target, d);
    }
  }
  return decisions;
}

// ---------------------------------------------------------------------------
// Verification (textbook route)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You verify one answer to a Bihar Board Class 10 Science multiple-choice
question. You may use ONLY the textbook excerpts given below the question — nothing else. This
is the same rule the tutor app itself must follow: never answer from outside knowledge.

You are given the question text, its four options (key a-d), and textbook excerpts retrieved by
search (each with its chapter title).

- If the excerpts clearly state or clearly imply which option is correct, answer with that
  option.
- "evidence" MUST be an exact, contiguous, word-for-word copy of a phrase or sentence from one
  excerpt — copy-paste, not a paraphrase or summary. Your answer is discarded if the quote does
  not literally appear in the excerpt text, so never write a quote you are inventing or
  reconstructing from memory.
- Some excerpts are markdown comparison tables with two columns (e.g. "Convex Mirror | Concave
  Lens"). Read the header row first and match every value to its OWN column — do not mix up
  which fact belongs to which side. If you are not fully certain which column a fact belongs to,
  treat it as insufficient rather than guessing.
- If the excerpts are about a different topic, or mention the topic without enough detail to be
  sure, say "insufficient". Do not guess — a confident wrong answer is worse than admitting you
  don't know.
- If more than one excerpt is relevant, quote the one that most directly answers the question.

Return ONLY JSON of this exact shape:
{"verdict":"answered","correctOption":"a","evidence":"<exact verbatim quote>","chapter":"<chapter title of the excerpt you used>"}
or, when unsure:
{"verdict":"insufficient","correctOption":null,"evidence":"","chapter":null}`;

function makeModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim().length < 10) {
    throw new Error('OPENAI_API_KEY missing in backend/.env — answer verification needs it.');
  }
  return new ChatOpenAI({
    apiKey: key,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: 0,
    modelKwargs: { response_format: { type: 'json_object' } },
  });
}

function toExcerpts(retrievalResults) {
  return retrievalResults.map((r) => ({
    chapter: r.metadata?.chapter_title || 'Unknown',
    text: r.metadata?.originalText || r.content,
  }));
}

function buildUserMessage(question, excerpts) {
  return JSON.stringify({
    question: { hi: question.text.hi, en: question.text.en },
    options: question.options.map((o) => ({ key: o.key, hi: o.text.hi, en: o.text.en })),
    excerpts,
  });
}

/** Strips markdown noise (bold markers, code fences, extra whitespace) so a quote and its
 * source can be compared on words alone, not formatting. */
function normalizeForMatch(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The mechanical check behind PROMPT_VERSION 2: is this "quote" actually IN the excerpts, or
 * did the model reconstruct/paraphrase it from memory? A wrong-but-fluent paraphrase is exactly
 * how 2016-a:B:31-ii slipped through in v1 — the model does not get to self-certify this. */
function evidenceIsGrounded(evidence, excerpts) {
  const needle = normalizeForMatch(evidence);
  if (!needle) return false;
  const haystack = normalizeForMatch(excerpts.map((e) => e.text).join(' \n '));
  return haystack.includes(needle);
}

/** One LLM call for one question. Returns a verdict object; never throws — a failure reads
 * as "insufficient" so one bad call cannot crash the run (retried once first). */
async function verifyOne(model, question, excerpts) {
  const attempt = async () => {
    const response = await model.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(question, excerpts) },
    ]);
    const raw = typeof response.content === 'string'
      ? response.content
      : response.content.map((part) => part.text || '').join('');
    const parsed = JSON.parse(raw);

    if (parsed.verdict === 'answered' && OPTION_KEYS.includes(parsed.correctOption)) {
      const evidence = String(parsed.evidence || '').trim();
      if (!evidenceIsGrounded(evidence, excerpts)) {
        return { verdict: 'ungrounded', correctOption: null, claimedOption: parsed.correctOption, evidence, chapter: parsed.chapter || null };
      }
      return { verdict: 'answered', correctOption: parsed.correctOption, evidence, chapter: parsed.chapter || null };
    }
    return { verdict: 'insufficient', correctOption: null, evidence: '', chapter: null };
  };

  try {
    return await attempt();
  } catch (err) {
    try {
      return await attempt();
    } catch (err2) {
      console.error(`    verify failed for ${question.sourceId}: ${err2.message}`);
      return { verdict: 'insufficient', correctOption: null, evidence: '', chapter: null };
    }
  }
}

/** Retrieval + (cached) verification for one objective MCQ. Returns the verdict plus the
 * evidence summary used for `answer.sourceDetail`; costs nothing on a cache hit. */
async function resolveAnswer(model, question, cache, stats) {
  const retrieval = await retrieveRelevantChunks(question.text.en, { topK: VERIFICATION_TOP_K });
  stats.retrieved += 1;

  if (retrieval.results.length === 0) {
    stats.noEvidence += 1;
    return { verdict: 'insufficient', correctOption: null, evidence: '', chapter: null };
  }

  const key = cacheKey(question.sourceId, retrieval.results);
  if (cache[key]) {
    stats.cacheHit += 1;
    return cache[key];
  }

  const excerpts = toExcerpts(retrieval.results);
  const verdict = await verifyOne(model, question, excerpts);
  stats.llmCalls += 1;
  if (verdict.verdict === 'ungrounded') {
    stats.groundingFailed += 1;
    console.warn(`    ${question.sourceId}: model claimed "${verdict.claimedOption}" but its quote wasn't found verbatim in the excerpts — treated as unverified.`);
  }
  cache[key] = verdict;
  saveCache(cache); // after every question — an interrupted run keeps what it paid for

  return verdict;
}

// ---------------------------------------------------------------------------
// question -> question with answer resolved (§5.2)
// ---------------------------------------------------------------------------

/** Same structural checks Stage D used, minus `answer-missing` — that one blocker is this
 * stage's entire job, so it is decided here instead of copied. */
function computeBlockers(question) {
  const blockers = [];
  const complete = (t) => Boolean(t.hi && t.en && t.hinglish);

  if (!question.text.hi) blockers.push('missing-hindi');
  if (!question.text.en) blockers.push('missing-english');
  if (!question.text.hinglish) blockers.push('missing-hinglish');

  if (question.type === 'mcq') {
    const options = question.options || [];
    if (options.length !== 4) blockers.push('options-incomplete');
    else if (!options.every((o) => complete(o.text))) blockers.push('options-language-incomplete');
  }

  if (question.section === 'subjective') blockers.push('subjective');
  if (question.diagram.required) blockers.push('diagram-required');
  if (question.marks == null) blockers.push('marks-missing');

  if (question.section === 'objective' && question.type === 'mcq' && !question.answer.correctOption) {
    blockers.push('answer-unverified');
  }

  return blockers.sort();
}

async function resolveQuestion(model, question, cache, resolvedDecisions, stats) {
  const isObjectiveMcq = question.section === 'objective' && question.type === 'mcq';

  let answer = question.answer;
  if (isObjectiveMcq) {
    stats.mcqTotal += 1;
    const decision = resolvedDecisions.get(question.sourceId);

    if (decision) {
      // Human decision (P4) — never re-verified, never overridden by automation.
      stats.humanConfirmed += 1;
      answer = {
        correctOption: decision.value,
        text: { hi: null, en: null, hinglish: null },
        source: 'human',
        sourceDetail: decision.reason || null,
        confidence: 'L4',
        conflicts: [],
      };
    } else if (!question.text.en) {
      // Already carries a `missing-english` blocker from Stage C/D (source never had an
      // English transcription, or it's a genuine content gap) — retrieval needs an English
      // query against the English textbook, so there is nothing to verify against. Skip
      // rather than crash retrieveRelevantChunks() on an empty string (it throws).
      stats.skippedNoEnglish += 1;
      answer = { ...question.answer, source: 'none', sourceDetail: null };
    } else {
      const verdict = await resolveAnswer(model, question, cache, stats);

      answer = verdict.correctOption
        ? {
            correctOption: verdict.correctOption,
            text: { hi: null, en: null, hinglish: null },
            source: 'textbook',
            sourceDetail: verdict.chapter
              ? `RAG textbook match — ${verdict.chapter}: "${verdict.evidence}"`
              : verdict.evidence || null,
            confidence: 'L3',
            conflicts: [],
          }
        : {
            ...question.answer,
            source: 'none',
            sourceDetail: null,
          };

      if (verdict.correctOption) stats.verified += 1;
      else stats.unverified += 1;
    }
  }

  const resolved = { ...question, answer };
  resolved.blockers = computeBlockers(resolved);
  resolved.usableInQuiz = resolved.blockers.length === 0;
  return resolved;
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

/** Sorted keys, no timestamps — so a re-run produces a byte-identical file (P5). */
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

async function processPaper(paperId, model, cache, resolvedDecisions, options) {
  const inPath = path.join(QUESTIONS_DIR, `${paperId}.json`);
  if (!fs.existsSync(inPath)) {
    throw new Error(`No stage3-questions/${paperId}.json — run Stage D first.`);
  }
  const source = JSON.parse(fs.readFileSync(inPath, 'utf8'));

  const stats = { mcqTotal: 0, retrieved: 0, noEvidence: 0, cacheHit: 0, llmCalls: 0, verified: 0, unverified: 0, groundingFailed: 0, humanConfirmed: 0, skippedNoEnglish: 0 };

  if (options.dryRun) {
    const mcq = source.questions.filter((q) => q.section === 'objective' && q.type === 'mcq');
    console.log(`  objective MCQ: ${mcq.length}  subjective/other: ${source.questions.length - mcq.length}`);
    console.log('  (dry run — no retrieval, no LLM calls)');
    return { outPath: null, stats };
  }

  const questions = [];
  for (const question of source.questions) {
    questions.push(await resolveQuestion(model, question, cache, resolvedDecisions, stats));
  }

  const usableInQuiz = questions.filter((q) => q.usableInQuiz).length;
  const l3Plus = questions.filter((q) => ['L3', 'L4'].includes(q.answer.confidence)).length;

  const output = {
    schemaVersion: SCHEMA_VERSION,
    paper: source.paper,
    totals: {
      ...source.totals,
      usableInQuiz,
      l3PlusConfidence: l3Plus,
    },
    flags: source.flags || [],
    questions,
  };

  fs.mkdirSync(ANSWERS_DIR, { recursive: true });
  const outPath = path.join(ANSWERS_DIR, `${paperId}.json`);
  fs.writeFileSync(outPath, stableStringify(output), 'utf8');
  return { outPath, stats };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const requested = args.filter((a) => !a.startsWith('--'));

  const papers = requested.length
    ? requested
    : fs.existsSync(QUESTIONS_DIR)
      ? fs.readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.replace(/\.json$/, '')).sort()
      : [];

  if (!papers.length) {
    console.error(`No papers found in ${QUESTIONS_DIR} — run Stage D first.`);
    process.exit(1);
  }

  if (!dryRun) await connectDB();
  const model = dryRun ? null : makeModel();
  const cache = loadCache();
  const resolvedDecisions = loadResolvedDecisions();
  if (resolvedDecisions.size) {
    console.log(`Human-confirmed answers loaded: ${resolvedDecisions.size} (from data/quiz-bank/review/resolved.json)`);
  }
  let failed = 0;

  for (const paperId of papers) {
    console.log(`\n${paperId}${dryRun ? '  (dry run)' : ''}`);
    console.log('-'.repeat(60));
    let result;
    try {
      result = await processPaper(paperId, model, cache, resolvedDecisions, { dryRun });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed += 1;
      continue;
    }

    const s = result.stats;
    if (!dryRun) {
      console.log(`  objective MCQ: ${s.mcqTotal}`);
      console.log(`  verified (L3, textbook): ${s.verified}`);
      console.log(`  human-confirmed (L4): ${s.humanConfirmed}`);
      console.log(`  skipped (no English text — missing-english blocker): ${s.skippedNoEnglish}`);
      console.log(`  unverified (no usable evidence): ${s.unverified}  (zero-retrieval: ${s.noEvidence}, failed grounding check: ${s.groundingFailed})`);
      console.log(`  llm calls: ${s.llmCalls}  cache hits: ${s.cacheHit}`);
    }
    if (result.outPath) {
      console.log(`  written: ${path.relative(REPO_ROOT, result.outPath).replace(/\\/g, '/')}`);
    }
  }

  if (!dryRun) await disconnectDB();
  console.log('');
  process.exit(failed ? 1 : 0);
}

main();
