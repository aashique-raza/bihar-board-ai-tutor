/**
 * Quiz Bank — Stage G: review queue + final health report
 *
 * Input:  data/quiz-bank/bank/questions.json     (Stage F output)
 *         data/quiz-bank/bank/clusters.json       (Stage F output — proposed near-duplicates)
 *         data/quiz-bank/review/resolved.json     (human decisions — P4, never overwritten)
 *         data/quiz-bank/stage1-pages/<paperId>/page-NN.json   (per-page OCR confidence)
 * Output: data/quiz-bank/review/queue.json         (severity-sorted, what still needs a human)
 *         data/quiz-bank/reports/health.json       (final numbers for this run of the bank)
 *
 * The queue only ever lists what resolved.json has NOT already answered (P4) — a decision that
 * matches an item's target + field makes that item disappear on the next run, permanently.
 *
 * Six categories, in severity order (QUIZ_DATA_PIPELINE.md §7 Stage G):
 *   red    — answer-conflict, language-missing
 *   orange — near-duplicate, low-ocr-confidence
 *   yellow — chapter-unmapped, marks-mismatch
 *
 * Run: node backend/scripts/quiz-bank/buildReview.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const BANK_DIR = path.join(REPO_ROOT, 'data/quiz-bank/bank');
const QUESTIONS_PATH = path.join(BANK_DIR, 'questions.json');
const CLUSTERS_PATH = path.join(BANK_DIR, 'clusters.json');
const REVIEW_DIR = path.join(REPO_ROOT, 'data/quiz-bank/review');
const RESOLVED_PATH = path.join(REVIEW_DIR, 'resolved.json');
const QUEUE_OUT_PATH = path.join(REVIEW_DIR, 'queue.json');
const PAGES_DIR = path.join(REPO_ROOT, 'data/quiz-bank/stage1-pages');
const REPORTS_DIR = path.join(REPO_ROOT, 'data/quiz-bank/reports');
const HEALTH_OUT_PATH = path.join(REPORTS_DIR, 'health.json');

const SCHEMA_VERSION = 1;

const SEVERITY_LABEL = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
};

// ---------------------------------------------------------------------------
// helpers shared with the other quiz-bank stages
// ---------------------------------------------------------------------------

/** Sorted keys, no timestamps — a re-run with unchanged input produces a byte-identical
 * file (P5). Same helper as buildBank.js / buildAnswers.js. */
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

function paperIdFromSourceId(sourceId) {
  return String(sourceId || '').split(':')[0] || null;
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// P4 — resolved.json replay: a decision matching (target, field) removes the item forever
// ---------------------------------------------------------------------------

function buildResolvedIndex(resolved) {
  const index = new Set();
  for (const decision of resolved.decisions || []) {
    index.add(`${decision.target}::${decision.field}`);
  }
  return index;
}

function isResolved(resolvedIndex, target, field) {
  return resolvedIndex.has(`${target}::${field}`);
}

// ---------------------------------------------------------------------------
// per-page OCR confidence lookup (low-ocr-confidence category)
// ---------------------------------------------------------------------------

function loadPageConfidence(paperId, pageNumber) {
  const pagePath = path.join(PAGES_DIR, paperId, `page-${String(pageNumber).padStart(2, '0')}.json`);
  if (!fs.existsSync(pagePath)) return null;
  const page = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
  return page.confidence || null;
}

// ---------------------------------------------------------------------------
// queue building
// ---------------------------------------------------------------------------

function buildQueueItems(bank, clusters, resolvedIndex) {
  const items = [];

  for (const entry of bank.questions) {
    const q = entry.canonical;
    const target = q.sourceId;
    const paperId = paperIdFromSourceId(target);

    // red — answer conflict (A6): two sources disagreed on the answer.
    if ((q.answer.conflicts || []).length > 0 && !isResolved(resolvedIndex, target, 'answer.correctOption')) {
      items.push({
        severity: 'red',
        category: 'answer-conflict',
        target,
        questionId: entry.questionId,
        summary: `Answer sources disagree for ${target}: ${JSON.stringify(q.answer.conflicts)}`,
      });
    }

    // red — language missing: Stage D left one of the three languages out.
    const missingLangBlockers = (q.blockers || []).filter((b) =>
      ['missing-hindi', 'missing-english', 'missing-hinglish', 'options-language-incomplete'].includes(b)
    );
    for (const blocker of missingLangBlockers) {
      const field = `text.${blocker.replace('missing-', '')}`;
      if (!isResolved(resolvedIndex, target, field) && !isResolved(resolvedIndex, target, 'text.all')) {
        items.push({
          severity: 'red',
          category: 'language-missing',
          target,
          questionId: entry.questionId,
          summary: `${target} is missing a language (${blocker})`,
        });
      }
    }

    // orange — low OCR confidence on any page the canonical text was read from.
    if (paperId) {
      for (const pageNumber of q.provenance?.pages || []) {
        const confidence = loadPageConfidence(paperId, pageNumber);
        if ((confidence === 'low' || confidence === 'medium') && !isResolved(resolvedIndex, target, 'ocr-confidence-confirmed')) {
          items.push({
            severity: 'orange',
            category: 'low-ocr-confidence',
            target,
            questionId: entry.questionId,
            summary: `${target} was read from ${paperId} page ${pageNumber} at "${confidence}" confidence`,
          });
        }
      }
    }

    // yellow — chapter unmapped (Stage F could not find a matching chunk).
    if ((q.flags || []).includes('chapter-unmapped') && !isResolved(resolvedIndex, target, 'chapter.chapterId')) {
      items.push({
        severity: 'yellow',
        category: 'chapter-unmapped',
        target,
        questionId: entry.questionId,
        summary: `${target} has no chapter mapping`,
      });
    }

    // yellow — marks mismatch (A18): per-question marks disagreed with the paper's declared total.
    if ((q.flags || []).includes('marks-mismatch') && !isResolved(resolvedIndex, target, 'marks')) {
      items.push({
        severity: 'yellow',
        category: 'marks-mismatch',
        target,
        questionId: entry.questionId,
        summary: `${target} marks do not match the paper's declared total`,
      });
    }
  }

  // orange — near-duplicate clusters proposed by Stage F, not yet merged/rejected by a human.
  for (const cluster of clusters.clusters || []) {
    if (!isResolved(resolvedIndex, cluster.clusterId, 'cluster.decision')) {
      items.push({
        severity: 'orange',
        category: 'near-duplicate',
        target: cluster.clusterId,
        questionId: null,
        summary: `Cluster ${cluster.clusterId} proposes merging ${cluster.members.join(' + ')} (similarity ${cluster.similarity})`,
      });
    }
  }

  const severityRank = { red: 0, orange: 1, yellow: 2 };
  items.sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return String(a.target).localeCompare(String(b.target));
  });

  return items.map((item, i) => ({
    id: `rq-${String(i + 1).padStart(6, '0')}`,
    label: `${SEVERITY_LABEL[item.severity]} ${item.category}`,
    ...item,
  }));
}

// ---------------------------------------------------------------------------
// health report
// ---------------------------------------------------------------------------

function buildHealthReport(bank, queueItems) {
  const questions = bank.questions;
  const total = questions.length;

  const objective = questions.filter((e) => e.canonical.section === 'objective');
  const subjective = questions.filter((e) => e.canonical.section === 'subjective');

  const languageComplete = objective.filter((e) => {
    const t = e.canonical.text;
    return t.hi && t.en && t.hinglish;
  }).length;

  const confidenceCounts = {};
  for (const e of objective) {
    const c = e.canonical.answer.confidence;
    confidenceCounts[c] = (confidenceCounts[c] || 0) + 1;
  }
  const l3OrAbove = (confidenceCounts.L3 || 0) + (confidenceCounts.L4 || 0);

  const usableInQuiz = questions.filter((e) => e.usableInQuiz).length;
  const mapped = questions.filter((e) => e.chapter?.chapterId).length;

  const severityCounts = { red: 0, orange: 0, yellow: 0 };
  for (const item of queueItems) severityCounts[item.severity] += 1;

  const pct = (n, d) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(1)));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    totals: {
      questions: total,
      objective: objective.length,
      subjective: subjective.length,
    },
    objectiveLanguageCompletePct: pct(languageComplete, objective.length),
    objectiveConfidenceCounts: confidenceCounts,
    objectiveL3OrAbovePct: pct(l3OrAbove, objective.length),
    usableInQuiz: {
      count: usableInQuiz,
      pct: pct(usableInQuiz, total),
    },
    chapterMapped: {
      count: mapped,
      pct: pct(mapped, total),
    },
    reviewQueue: {
      open: queueItems.length,
      bySeverity: severityCounts,
    },
    exitCriteriaNote:
      'These numbers describe only the papers currently in bank/questions.json. QUIZ_DATA_PIPELINE.md §12 exit criteria apply once all 20 papers have gone through Stage B-G, not to a single-paper pilot run.',
  };
}

// ---------------------------------------------------------------------------

function main() {
  const bank = loadJson(QUESTIONS_PATH, null);
  if (!bank) {
    throw new Error(`No bank found at ${QUESTIONS_PATH} — run Stage F first.`);
  }
  const clusters = loadJson(CLUSTERS_PATH, { clusters: [] });
  const resolved = loadJson(RESOLVED_PATH, { decisions: [] });
  const resolvedIndex = buildResolvedIndex(resolved);

  const queueItems = buildQueueItems(bank, clusters, resolvedIndex);
  const health = buildHealthReport(bank, queueItems);

  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(QUEUE_OUT_PATH, stableStringify({ schemaVersion: SCHEMA_VERSION, items: queueItems }), 'utf8');
  fs.writeFileSync(HEALTH_OUT_PATH, stableStringify(health), 'utf8');

  console.log(`review queue: ${queueItems.length} open item(s) (red ${health.reviewQueue.bySeverity.red}, orange ${health.reviewQueue.bySeverity.orange}, yellow ${health.reviewQueue.bySeverity.yellow})`);
  console.log(`objective questions: ${health.totals.objective}, language-complete ${health.objectiveLanguageCompletePct}%, L3+ ${health.objectiveL3OrAbovePct}%`);
  console.log(`usable in quiz: ${health.usableInQuiz.count}/${health.totals.questions} (${health.usableInQuiz.pct}%)`);
  console.log(`chapter mapped: ${health.chapterMapped.count}/${health.totals.questions} (${health.chapterMapped.pct}%)`);
  console.log('');
  console.log(`written: ${path.relative(REPO_ROOT, QUEUE_OUT_PATH).replace(/\\/g, '/')}`);
  console.log(`written: ${path.relative(REPO_ROOT, HEALTH_OUT_PATH).replace(/\\/g, '/')}`);
}

main();
