/**
 * run-golden-set.js
 *
 * Runs the golden test set against the live /api/v1/ask endpoint.
 * Server MUST be running on PORT (default 5000) before calling this script.
 *
 * Usage:
 *   node scripts/run-golden-set.js                  → run and print results
 *   node scripts/run-golden-set.js --save-baseline  → run + save to test/golden-baseline-phase1.json
 *
 * Pass/Fail logic:
 *   PASS  = intent matches expectedIntent
 *   WARN  = intent matched but quality checks failed (partial pass)
 *   FAIL  = intent did not match
 *
 * Quality checks are heuristic only — they look for substrings in the answer text.
 * A quality check failure does NOT fail the test, it just raises a warning.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT        = process.env.PORT || 5000;
const BASE_URL    = `http://localhost:${PORT}`;
const QUERIES_PATH = path.join(__dirname, '../test/golden-queries.json');
const BASELINE_PATH = path.join(__dirname, '../test/golden-baseline-phase1.json');

const SAVE_BASELINE = process.argv.includes('--save-baseline');
const FILTER_CAT    = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];

// ── ANSI colour helpers (work in most terminals) ──────────────────────────────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const CYAN   = (s) => `\x1b[36m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

// ── HTTP helper ───────────────────────────────────────────────────────────────
const askQuestion = async (query) => {
  const body = {
    question:  query.query,
    studyMode: query.studyMode,
    sessionId: randomUUID(), // fresh session per query — no state bleed
  };

  if (query.chapterId) body.chapterId = query.chapterId;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30_000); // 30 second timeout

  try {
    const res = await fetch(`${BASE_URL}/api/v1/ask`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    return { error: err.name === 'AbortError' ? 'TIMEOUT (30s)' : err.message };
  }
};

// ── Quality check: case-insensitive substring search in answer text ───────────
const checkQuality = (response, checks) => {
  if (!checks || checks.length === 0) return { passed: true, failed: [] };
  const answerText = (response.answer || '').toLowerCase();
  const failed = checks.filter(kw => !answerText.includes(kw.toLowerCase()));
  return { passed: failed.length === 0, failed };
};

// ── Main runner ───────────────────────────────────────────────────────────────
const run = async () => {
  const allQueries = JSON.parse(readFileSync(QUERIES_PATH, 'utf8'));
  const queries = FILTER_CAT
    ? allQueries.filter(q => q.category === FILTER_CAT)
    : allQueries;

  console.log(BOLD(`\n══════════════════════════════════════════════════════`));
  console.log(BOLD(`  ZUNO GOLDEN TEST SET RUNNER`));
  console.log(BOLD(`══════════════════════════════════════════════════════`));
  console.log(`  Server  : ${BASE_URL}`);
  console.log(`  Queries : ${queries.length} (total in set: ${allQueries.length})`);
  console.log(`  Save?   : ${SAVE_BASELINE ? BASELINE_PATH : 'No'}`);
  console.log(`  Filter  : ${FILTER_CAT || 'All categories'}`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // Quick ping before running to fail fast if server is down
  try {
    const ping = await fetch(`${BASE_URL}/health`);
    if (!ping.ok) throw new Error(`Health check returned ${ping.status}`);
    console.log(GREEN('✓ Server is reachable\n'));
  } catch {
    console.log(RED('✗ Server not reachable at ' + BASE_URL));
    console.log(YELLOW('  → Start the server first: cd backend && npm run dev'));
    process.exit(1);
  }

  const results = [];
  let passed = 0, warned = 0, failed = 0;

  for (const query of queries) {
    process.stdout.write(`[${query.id}] ${query.category.padEnd(20)} "${query.query.slice(0, 40).padEnd(40)}" → `);

    const response = await askQuestion(query);

    const result = {
      id:               query.id,
      category:         query.category,
      query:            query.query,
      studyMode:        query.studyMode,
      expectedIntent:   query.expectedIntent,
      expectedResponseMode: query.expectedResponseMode,
      note:             query.note,
      timestamp:        new Date().toISOString(),
    };

    if (response.error) {
      console.log(RED(`ERROR — ${response.error}`));
      result.outcome      = 'ERROR';
      result.actualIntent = null;
      result.error        = response.error;
      failed++;
    } else {
      // API wraps response in { success, message, data: {...} }
      const payload      = response.data ?? response;

      // Provider error (rate limit, auth, network) — no decision field available
      if (payload.status === 'provider_error') {
        console.log(YELLOW(`SKIP  — provider_error (rate limit / LLM unavailable)`));
        result.outcome      = 'SKIP';
        result.actualIntent = 'PROVIDER_ERROR';
        result.error        = payload.answer || 'provider_error';
        failed++;
      } else {
        const actualIntent = payload.decision?.intent ?? 'UNKNOWN';
        const intentMatch  = actualIntent === query.expectedIntent;
        const quality      = checkQuality(payload, query.qualityChecks);

        result.actualIntent       = actualIntent;
        result.actualResponseMode = payload.responseMode;
        result.intentMatch        = intentMatch;
        result.qualityPassed      = quality.passed;
        result.qualityFailed      = quality.failed;
        result.answerSnippet      = (payload.answer || '').slice(0, 150);
        result.tokenUsage         = payload.decision?.tokenUsage ?? 0;

        if (!intentMatch) {
          result.outcome = 'FAIL';
          console.log(RED(`FAIL  — got ${actualIntent} (expected ${query.expectedIntent})`));
          failed++;
        } else if (!quality.passed) {
          result.outcome = 'WARN';
          console.log(YELLOW(`WARN  — intent ✓ but quality checks failed: [${quality.failed.join(', ')}]`));
          warned++;
        } else {
          result.outcome = 'PASS';
          console.log(GREEN(`PASS  — ${actualIntent}`));
          passed++;
        }
      }
    }

    results.push(result);

    // 5 second delay between calls — Groq free tier rate limit safety
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total       = queries.length;
  const accuracy    = ((passed + warned) / total * 100).toFixed(1);
  const intentAccuracy = ((passed + warned) / total * 100).toFixed(1);

  console.log(BOLD(`\n══════════════════════════════════════════════════════`));
  console.log(BOLD('  RESULTS SUMMARY'));
  console.log(`══════════════════════════════════════════════════════`);
  console.log(`  Total   : ${total}`);
  console.log(`  ${GREEN('PASS')}    : ${passed}`);
  console.log(`  ${YELLOW('WARN')}    : ${warned}  (intent correct, quality checks failed)`);
  console.log(`  ${RED('FAIL')}    : ${failed}  (intent wrong or error)`);
  console.log(`  Intent accuracy : ${intentAccuracy}%  (target: ≥95%)`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // ── Per-category breakdown ─────────────────────────────────────────────────
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { pass: 0, warn: 0, fail: 0, total: 0 };
    byCategory[r.category].total++;
    if (r.outcome === 'PASS') byCategory[r.category].pass++;
    else if (r.outcome === 'WARN') byCategory[r.category].warn++;
    else byCategory[r.category].fail++;
  }

  console.log(BOLD('  Per-Category Breakdown'));
  console.log('  ' + '─'.repeat(52));
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = (((stats.pass + stats.warn) / stats.total) * 100).toFixed(0);
    const bar = `${stats.pass}P ${stats.warn}W ${stats.fail}F / ${stats.total}`;
    const status = stats.fail > 0 ? RED(pct + '%') : pct === '100' ? GREEN(pct + '%') : YELLOW(pct + '%');
    console.log(`  ${cat.padEnd(22)} ${bar.padEnd(18)} ${status}`);
  }
  console.log();

  // ── Failed/Warned details ──────────────────────────────────────────────────
  const problems = results.filter(r => r.outcome === 'FAIL' || r.outcome === 'WARN' || r.outcome === 'ERROR');
  if (problems.length > 0) {
    console.log(BOLD('  Issues To Fix'));
    console.log('  ' + '─'.repeat(52));
    for (const r of problems) {
      const prefix = r.outcome === 'FAIL' ? RED('FAIL') : r.outcome === 'ERROR' ? RED('ERR ') : YELLOW('WARN');
      console.log(`  [${r.id}] ${prefix} — "${r.query}"`);
      if (r.outcome === 'FAIL') {
        console.log(`         Expected: ${r.expectedIntent}  Got: ${r.actualIntent}`);
      } else if (r.outcome === 'WARN') {
        console.log(`         Missing quality keywords: [${r.qualityFailed?.join(', ')}]`);
      } else {
        console.log(`         Error: ${r.error}`);
      }
      if (r.note) console.log(CYAN(`         Note: ${r.note}`));
    }
    console.log();
  }

  // ── Gate check ─────────────────────────────────────────────────────────────
  if (parseFloat(intentAccuracy) >= 95) {
    console.log(GREEN(BOLD('  ✓ GATE PASSED — Intent accuracy ≥ 95%. Ready for Phase 2.')));
  } else {
    console.log(RED(BOLD('  ✗ GATE FAILED — Intent accuracy < 95%. Fix decider before Phase 2.')));
  }
  console.log();

  // ── Save baseline ──────────────────────────────────────────────────────────
  if (SAVE_BASELINE) {
    const baseline = {
      runAt:          new Date().toISOString(),
      phase:          'post-phase1-baseline',
      totalQueries:   total,
      passed,
      warned,
      failed,
      intentAccuracy: intentAccuracy + '%',
      results,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), 'utf8');
    console.log(GREEN(`  ✓ Baseline saved to: ${BASELINE_PATH}`));
    console.log();
  }
};

run().catch(err => {
  console.error(RED('\n[run-golden-set] Unexpected error:'), err.message);
  process.exit(1);
});
