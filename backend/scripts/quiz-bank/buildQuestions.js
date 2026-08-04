/**
 * Quiz Bank — Stage D: structure + three languages
 *
 * Input:  data/quiz-bank/stage2-blocks/<paperId>.json     (Stage C output, immutable)
 * Output: data/quiz-bank/stage3-questions/<paperId>.json  (QUIZ_DATA_PIPELINE.md §5.2 shape)
 *
 * Stage C already gave every question its Hindi and its English. The one thing missing —
 * and the only thing this stage really produces — is Hinglish, which no paper contains and
 * which therefore has to be written. §8 of the pipeline doc is the rulebook for it.
 *
 * Hinglish comes from an LLM, and an LLM is not reproducible. P5 says a re-run must produce
 * a byte-identical file, so every generated string is written to a cache keyed by the Hindi
 * and English it came from. A second run makes zero LLM calls. Only text that actually
 * changed upstream is ever regenerated, and the same sentence appearing in two papers is
 * translated once for both — which is also what makes the remaining 19 papers cheap (P1).
 *
 * No answers are decided here. That is Stage E, deliberately: an answer invented next to a
 * translation is an answer nobody verified. Every question therefore leaves this stage with
 * `usableInQuiz: false` and an honest `answer-missing` blocker.
 *
 * Run: node backend/scripts/quiz-bank/buildQuestions.js [paperId ...]
 *      (no argument = every paper that has a stage2-blocks file)
 *      --dry-run   report what would be translated, call no LLM, write nothing
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';

import { SCIENCE_GLOSSARY } from '../../src/constants/scienceGlossary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

const BLOCKS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage2-blocks');
const QUESTIONS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage3-questions');
const CACHE_PATH = path.join(QUESTIONS_DIR, '_hinglish-cache.json');

const SCHEMA_VERSION = 1;
const BATCH_SIZE = 12;
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Bumped whenever SYSTEM_PROMPT changes in a way that should change its output. It is part
 * of the cache key, so tightening the rules regenerates every string instead of leaving old
 * translations sitting next to new ones — which is the only way the cache stays honest.
 *
 * v2: v1 leaked English connectors ("Misal of phytohormone hai"), added full stops the Hindi
 *     never had, reordered a sentence, and transliterated "Bifocal" into "baifokal".
 */
const PROMPT_VERSION = 2;

// ---------------------------------------------------------------------------
// Hinglish cache (P5 — the reason a re-run is free and byte-identical)
// ---------------------------------------------------------------------------

/**
 * Cache key is the source pair, not the question's position. Two papers asking the same
 * thing hit the same entry, and moving a question never invalidates its translation (P6).
 * The prompt version is part of the key so a rule change cannot leave stale output behind.
 */
function cacheKey(hi, en) {
  return crypto
    .createHash('sha256')
    .update(`v${PROMPT_VERSION} | ${hi ?? ''} | ${en ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')).entries || {};
}

function saveCache(entries) {
  fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, entries }), 'utf8');
}

// ---------------------------------------------------------------------------
// Hinglish generation (§8)
// ---------------------------------------------------------------------------

const GLOSSARY_LINES = Object.entries(SCIENCE_GLOSSARY)
  .map(([english, hinglish]) => `  ${english} -> ${hinglish.replace(/\s*\(.*\)$/, '')}`)
  .join('\n');

const SYSTEM_PROMPT = `You convert Bihar Board Class 10 Science exam questions into Hinglish
(Hindi written in Roman script) for a study app whose students read Hinglish by default.

For every item you are given the same sentence twice: "hi" is the original Devanagari, "en" is
the paper's own English. Write the Hinglish from the HINDI — that is the sentence the student
will hear in their head. Use the English only to get technical terms and numbers right.

Rules, all of them hard:
1. Roman script only. Not a single Devanagari character.
2. Every ordinary Hindi word becomes that same Hindi word in Roman letters. Never replace a
   Hindi word with its English equivalent, and never leave an English connector word such as
   of / the / is / and inside the sentence.
   WRONG: "पादप हार्मोन का उदाहरण है" -> "Misal of phytohormone hai"
   RIGHT: "पादप हार्मोन का उदाहरण है" -> "Padap hormone ka udaharan hai"
3. Scientific terms are the one exception — those stay in English, spelled the English way:
   photosynthesis, mitochondria, voltmeter, bifocal, auxin, pepsin, hydrocarbon.
   Never spell a scientific term phonetically ("baifokal" is wrong, "Bifocal" is right).
   If the "en" text gives the term, copy its spelling.
4. Where a term appears in this list, use exactly this spelling:
${GLOSSARY_LINES}
5. Keep the Hindi word order. Do not rearrange the sentence.
   WRONG: "विद्युत बल्ब पर 100 W - 220 V अंकित है" -> "100 W - 220 V par vidyut bulb par ankit hai"
   RIGHT: "विद्युत बल्ब पर 100 W - 220 V अंकित है" -> "Vidyut bulb par 100 W - 220 V ankit hai"
6. Keep it simple and spoken, the way a student would say it out loud.
   Example: "समतल दर्पण द्वारा बना प्रतिबिम्ब होता है" -> "Samtal darpan dwara bana pratibimb hota hai"
7. Numbers, units and formulas stay plain: 100 W, 220 V, CO2, H2O, 10^8. No subscripts.
8. Translate only. Do not answer, explain, shorten or fix the question.
9. Punctuation must match the Hindi exactly. If the Hindi ends with "?" yours ends with "?".
   If the Hindi ends with "।" yours ends with ".". If the Hindi ends with no punctuation at
   all — which is normal for MCQ stems and options — yours ends with none either. Never add
   a full stop that was not there.
10. Start with a capital letter, except when the item is a single word or short phrase that
    the "en" text writes in lower case — then match the "en" capitalisation.

Return ONLY a JSON object of this exact shape, nothing else:
{"results":[{"id":"<the id you were given>","hinglish":"<your text>"}]}
Return one entry for every id, in the same order.`;

function makeModel() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.trim().length < 10) {
    throw new Error('OPENAI_API_KEY missing in backend/.env — Hinglish generation needs it.');
  }
  return new ChatOpenAI({
    apiKey: key,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: 0,
    modelKwargs: { response_format: { type: 'json_object' } },
  });
}

/** One LLM call for a batch of {id, hi, en}. Returns a Map id -> hinglish (bad ones dropped). */
async function translateBatch(model, items) {
  const response = await model.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ items }) },
  ]);

  const raw = typeof response.content === 'string'
    ? response.content
    : response.content.map((part) => part.text || '').join('');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map(); // whole batch retried one-by-one by the caller
  }

  const out = new Map();
  for (const entry of parsed.results || []) {
    const text = typeof entry?.hinglish === 'string' ? entry.hinglish.trim() : '';
    // A Devanagari leak is the one failure mode that would otherwise pass silently into the
    // bank, so it is rejected here rather than flagged later.
    if (!text || DEVANAGARI.test(text)) continue;
    out.set(String(entry.id), text);
  }
  return out;
}

/**
 * Fill the cache for every requested {key, hi, en}. Anything already cached is skipped —
 * that is the whole point. A batch that comes back unparseable or short is retried item by
 * item, so one bad sentence cannot cost eleven good ones.
 */
async function ensureTranslations(needed, cache, { dryRun }) {
  const missing = needed.filter((item) => !cache[item.key]);
  if (!missing.length || dryRun) return { called: 0, failed: [] };

  const model = makeModel();
  const failed = [];
  let called = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const items = batch.map((item) => ({ id: item.key, hi: item.hi, en: item.en }));

    let results = new Map();
    try {
      results = await translateBatch(model, items);
      called += 1;
    } catch (err) {
      console.error(`    batch ${1 + i / BATCH_SIZE} failed: ${err.message}`);
    }

    const retry = batch.filter((item) => !results.has(item.key));
    for (const item of retry) {
      try {
        const single = await translateBatch(model, [{ id: item.key, hi: item.hi, en: item.en }]);
        called += 1;
        if (single.has(item.key)) results.set(item.key, single.get(item.key));
        else failed.push(item.key);
      } catch (err) {
        console.error(`    retry failed for ${item.key}: ${err.message}`);
        failed.push(item.key);
      }
    }

    for (const [key, text] of results) cache[key] = text;

    // Written after every batch, not at the end: an interrupted run keeps what it paid for.
    saveCache(cache);
    console.log(`    translated ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}`);
  }

  return { called, failed };
}

// ---------------------------------------------------------------------------
// block -> question (§5.2)
// ---------------------------------------------------------------------------

/** Every string in a paper that needs Hinglish, as {key, hi, en}. */
function collectStrings(blocks) {
  const seen = new Map();
  const add = (hi, en) => {
    if (!hi && !en) return;
    const key = cacheKey(hi, en);
    if (!seen.has(key)) seen.set(key, { key, hi: hi ?? '', en: en ?? '' });
  };

  for (const block of blocks) {
    add(block.text?.hi, block.text?.en);
    for (const option of block.options || []) add(option.text?.hi, option.text?.en);
  }
  return [...seen.values()];
}

/**
 * The one rule the model kept half-ignoring: it liked to end an MCQ option with a full stop
 * the Hindi never had ("काल्पनिक" -> "Kalpanik."). Punctuation is decidable from the source,
 * so it is decided here instead of being asked for — deterministic, and free on a re-run.
 */
function normalizeHinglish(hinglish, hi) {
  if (!hinglish) return hinglish;
  const source = (hi ?? '').trim();
  const sourceEndsClosed = /[।?!.]$/.test(source);
  return sourceEndsClosed ? hinglish : hinglish.replace(/\s*\.\s*$/, '');
}

function withHinglish(text, cache) {
  const hi = text?.hi ?? null;
  const en = text?.en ?? null;
  const raw = (hi || en) ? (cache[cacheKey(hi, en)] ?? null) : null;
  return { hi, en, hinglish: normalizeHinglish(raw, hi) };
}

/**
 * Decide, per question, whether it can ever reach a student — and if not, say exactly why.
 * At Stage D `answer-missing` is on every question by design; Stage E is what removes it.
 */
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
  if (!question.answer.correctOption) blockers.push('answer-missing');

  return blockers.sort();
}

function toQuestion(block, cache) {
  const question = {
    sourceId: block.sourceId,
    questionNumber: block.questionNumber,
    subPart: block.subPart,
    group: block.group,
    section: block.section,
    type: block.type,
    marks: block.marks,

    text: withHinglish(block.text, cache),
    options: block.options
      ? block.options.map((option) => ({ key: option.key, text: withHinglish(option.text, cache) }))
      : null,

    variantOf: block.variantOf,
    hasAlternative: block.hasAlternative,

    answer: {
      correctOption: null,
      text: { hi: null, en: null, hinglish: null },
      source: 'none',
      sourceDetail: null,
      confidence: 'L0',
      conflicts: [],
    },

    diagram: {
      required: Boolean(block.diagramMentioned),
      note: null,
    },

    usableInQuiz: false,
    blockers: [],

    provenance: {
      readBy: block.provenance?.readBy ?? 'vision',
      crossChecked: false,
      pages: block.provenance?.pdfPages ?? [],
    },

    flags: [...(block.flags || [])],
  };

  question.blockers = computeBlockers(question);

  // L1 = structure is complete in all three languages; anything less is L0 (§9).
  const structural = question.blockers.filter(
    (b) => b !== 'answer-missing' && b !== 'subjective' && b !== 'diagram-required'
  );
  question.answer.confidence = structural.length ? 'L0' : 'L1';
  question.usableInQuiz = question.blockers.length === 0;

  return question;
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

async function processPaper(paperId, cache, options) {
  const blocksPath = path.join(BLOCKS_DIR, `${paperId}.json`);
  if (!fs.existsSync(blocksPath)) {
    throw new Error(`No stage2-blocks/${paperId}.json — run Stage C first.`);
  }
  const source = JSON.parse(fs.readFileSync(blocksPath, 'utf8'));

  const strings = collectStrings(source.blocks);
  const uncached = strings.filter((s) => !cache[s.key]).length;
  console.log(`  strings: ${strings.length}  (cached ${strings.length - uncached}, to translate ${uncached})`);

  const { called, failed } = await ensureTranslations(strings, cache, options);
  if (called) console.log(`  llm calls: ${called}`);
  if (failed.length) console.log(`  untranslated after retry: ${failed.length}`);

  const questions = source.blocks.map((block) => toQuestion(block, cache));

  const objective = questions.filter((q) => q.section === 'objective');
  const trilingual = questions.filter(
    (q) => !q.blockers.some((b) => b.startsWith('missing-') || b.startsWith('options-'))
  );

  const output = {
    schemaVersion: SCHEMA_VERSION,
    paper: {
      ...source.paper,
      subject: 'science',
      class: 10,
      board: 'BSEB',
      extractionRoute: 'page-images',
      hasPrintedAnswerKey: false,
      duplicateOf: null,
    },
    totals: {
      questions: questions.length,
      objective: objective.length,
      subjective: questions.length - objective.length,
      trilingualComplete: trilingual.length,
      usableInQuiz: questions.filter((q) => q.usableInQuiz).length,
      marksGroupA: source.totals?.marksGroupA ?? null,
      marksGroupB: source.totals?.marksGroupB ?? null,
    },
    flags: [...(source.flags || [])],
    questions,
  };

  if (options.dryRun) return { output, outPath: null };

  fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
  const outPath = path.join(QUESTIONS_DIR, `${paperId}.json`);
  fs.writeFileSync(outPath, stableStringify(output), 'utf8');
  return { output, outPath };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const requested = args.filter((a) => !a.startsWith('--'));

  const papers = requested.length
    ? requested
    : fs.existsSync(BLOCKS_DIR)
      ? fs.readdirSync(BLOCKS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
      : [];

  if (!papers.length) {
    console.error(`No papers found in ${BLOCKS_DIR} — run Stage C first.`);
    process.exit(1);
  }

  const cache = loadCache();
  let failed = 0;

  for (const paperId of papers) {
    console.log(`\n${paperId}${dryRun ? '  (dry run)' : ''}`);
    console.log('-'.repeat(60));
    let result;
    try {
      result = await processPaper(paperId, cache, { dryRun });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failed += 1;
      continue;
    }

    const t = result.output.totals;
    console.log(`  questions: ${t.questions}  (objective ${t.objective}, subjective ${t.subjective})`);
    console.log(`  all three languages complete: ${t.trilingualComplete}/${t.questions}`);
    console.log(`  usable in quiz right now: ${t.usableInQuiz} (answers arrive in Stage E)`);

    const incomplete = result.output.questions.filter((q) =>
      q.blockers.some((b) => b.startsWith('missing-') || b.startsWith('options-'))
    );
    if (incomplete.length) {
      console.log('  incomplete:');
      for (const q of incomplete) console.log(`    ${q.sourceId}  ${q.blockers.join(', ')}`);
    }

    if (result.outPath) {
      console.log(`  written: ${path.relative(REPO_ROOT, result.outPath).replace(/\\/g, '/')}`);
    }
  }

  console.log('');
  process.exit(failed ? 1 : 0);
}

main();
