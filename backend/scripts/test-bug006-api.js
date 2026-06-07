/**
 * test-bug006-api.js
 *
 * API integration tests for BUG-006 fix: NEXT_STEP intent handling in focus mode.
 *
 * Run with: node scripts/test-bug006-api.js
 * Requires server running: npm run dev
 *
 * Tests A–E cover the full NEXT_STEP flow in global and focus mode.
 * Test F (chapter_complete simulation) is skipped — covered by unit tests.
 */

const API_BASE = 'http://localhost:5300';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sessionId = null;
let testNumber = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

const log = (label, value) => {
  if (typeof value === 'object' && value !== null) {
    console.log(`  ${label}:`, JSON.stringify(value, null, 2));
  } else {
    console.log(`  ${label}: ${value}`);
  }
};

const ask = async ({ question, studyMode = 'global', chapterId = null, useSession = true }) => {
  const body = { question, studyMode };

  if (useSession && sessionId) body.sessionId = sessionId;
  if (chapterId) body.chapterId = chapterId;

  const startTime = Date.now();

  const response = await fetch(`${API_BASE}/api/v1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - startTime;
  const data = await response.json();

  return { httpStatus: response.status, elapsed, data };
};

const runTest = async (label, { question, studyMode, chapterId, useSession = true, checks }) => {
  testNumber++;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST ${label}: ${question}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  studyMode: ${studyMode || 'global'}${chapterId ? `  chapterId: ${chapterId}` : ''}${useSession && sessionId ? `  sessionId: ${sessionId}` : '  (fresh session)'}`);

  let result;
  try {
    result = await ask({ question, studyMode, chapterId, useSession });
  } catch (err) {
    failCount++;
    failures.push({ label, failed: [`NETWORK ERROR: ${err.message}`] });
    console.log(`\n  ❌ TEST ${label} CRASHED: ${err.message}`);
    return;
  }

  const payload = result.data?.data || result.data;

  console.log(`\n  --- Response ---`);
  log('HTTP', result.httpStatus);
  log('Latency', `${result.elapsed}ms`);
  log('status', payload?.status);
  log('responseMode', payload?.responseMode);
  log('sections.length', payload?.sections?.length ?? 0);
  log('answer (first 180)', (payload?.answer || '').substring(0, 180));
  log('session.sessionId', payload?.session?.sessionId);
  log('session.lastChapterId', payload?.session?.lastChapterId);

  // Persist sessionId for follow-up tests
  if (payload?.session?.sessionId) {
    sessionId = payload.session.sessionId;
  }

  const passed = [];
  const failed = [];

  for (const [name, fn] of Object.entries(checks || {})) {
    try {
      const r = fn(payload, result);
      if (r === true) {
        passed.push(name);
      } else {
        failed.push(`${name}: ${r}`);
      }
    } catch (e) {
      failed.push(`${name}: EXCEPTION — ${e.message}`);
    }
  }

  console.log(`\n  --- Checks ---`);
  passed.forEach((n) => console.log(`  ✅ ${n}`));
  failed.forEach((m) => console.log(`  ❌ ${m}`));

  if (failed.length === 0) {
    passCount++;
    console.log(`\n  ✅ TEST ${label} PASSED`);
  } else {
    failCount++;
    failures.push({ label, failed });
    console.log(`\n  ❌ TEST ${label} FAILED`);
  }
};

// ---------------------------------------------------------------------------

const main = async () => {
  console.log('\n🧪 BUG-006 API Integration Tests — NEXT_STEP in Focus Mode');
  console.log('━'.repeat(70));
  console.log(`  Server: ${API_BASE}`);
  console.log(`  Date: ${new Date().toISOString()}`);

  // Verify server is up before running any test
  try {
    const probe = await fetch(`${API_BASE}/health`);
    if (!probe.ok) throw new Error(`/health returned ${probe.status}`);
  } catch {
    console.log('\n  ❌ Server not running. Start with: npm run dev');
    console.log('━'.repeat(70));
    process.exit(1);
  }

  console.log('  Server is up ✅\n');

  // ------------------------------------------------------------------
  // TEST A — Normal concept question still works (regression baseline)
  // ------------------------------------------------------------------
  await runTest('A', {
    question: 'photosynthesis kya hai',
    studyMode: 'global',
    useSession: false,
    checks: {
      'HTTP 200': (p, r) => r.httpStatus === 200 || `got ${r.httpStatus}`,
      'status === answered': (p) => p?.status === 'answered' || `got ${p?.status}`,
      'sections.length > 0': (p) => (p?.sections?.length > 0) || `got ${p?.sections?.length}`,
      'session returned': (p) => !!p?.session?.sessionId || 'no session',
    },
  });

  await delay(2500);

  // ------------------------------------------------------------------
  // TEST B — NEXT_STEP with no chapter context (global mode, no focus)
  // ------------------------------------------------------------------
  await runTest('B', {
    question: 'aage badho',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.httpStatus === 200 || `got ${r.httpStatus}`,
      'no crash (status present)': (p) => !!p?.status || 'status missing — likely crash',
      'answer non-empty': (p) => (p?.answer?.length > 0) || 'answer is empty',
    },
  });

  await delay(2500);

  // ------------------------------------------------------------------
  // TEST C — Focus mode first topic (fresh session)
  // ------------------------------------------------------------------
  sessionId = null; // force fresh session

  await runTest('C', {
    question: 'padhana shuru karo',
    studyMode: 'focus',
    chapterId: 'science.physics.chapter-03',
    useSession: false,
    checks: {
      'HTTP 200': (p, r) => r.httpStatus === 200 || `got ${r.httpStatus}`,
      'status === answered': (p) => p?.status === 'answered' || `got ${p?.status}`,
      'session.lastChapterId matches': (p) =>
        p?.session?.lastChapterId === 'science.physics.chapter-03' ||
        `got ${p?.session?.lastChapterId}`,
    },
  });

  await delay(2500);

  // ------------------------------------------------------------------
  // TEST D — NEXT_STEP in focus mode (THE CORE BUG-006 TEST)
  // ------------------------------------------------------------------
  await runTest('D', {
    question: 'aage badho',
    studyMode: 'focus',
    chapterId: 'science.physics.chapter-03',
    checks: {
      'HTTP 200': (p, r) => r.httpStatus === 200 || `got ${r.httpStatus}`,
      'status === answered': (p) => p?.status === 'answered' || `got ${p?.status}`,
      'sections.length > 0': (p) => (p?.sections?.length > 0) || `got ${p?.sections?.length}`,
      'answer.length > 20': (p) => (p?.answer?.length > 20) || `answer too short: ${p?.answer?.length}`,
      'no "content not found" in answer': (p) => {
        const a = (p?.answer || '').toLowerCase();
        if (a.includes('content not found')) return 'answer contains "content not found"';
        if (a.includes('nahi mila')) return 'answer contains "nahi mila"';
        return true;
      },
    },
  });

  await delay(2500);

  // ------------------------------------------------------------------
  // TEST E — NEXT_STEP again (second next, session from TEST D)
  // ------------------------------------------------------------------
  await runTest('E', {
    question: 'next topic',
    studyMode: 'focus',
    chapterId: 'science.physics.chapter-03',
    checks: {
      'HTTP 200': (p, r) => r.httpStatus === 200 || `got ${r.httpStatus}`,
      'status === answered': (p) => p?.status === 'answered' || `got ${p?.status}`,
      'sections.length > 0': (p) => (p?.sections?.length > 0) || `got ${p?.sections?.length}`,
    },
  });

  // ------------------------------------------------------------------
  // TEST F — Skipped (chapter_complete simulation requires cycling all
  // topics; unit tests in test-next-topic-resolver.js cover this case)
  // ------------------------------------------------------------------
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST F: Chapter complete simulation — SKIPPED`);
  console.log(`  (unit test in scripts/test-next-topic-resolver.js covers chapter_complete)`);
  console.log(`${'='.repeat(70)}`);

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const total = testNumber; // F not counted
  console.log(`\n\n${'━'.repeat(70)}`);
  console.log(`📊 BUG-006 API TEST SUMMARY`);
  console.log(`${'━'.repeat(70)}`);
  console.log(`  Tests run:  ${total} (A–E)`);
  console.log(`  Passed:     ${passCount} ✅`);
  console.log(`  Failed:     ${failCount} ❌`);

  if (failures.length > 0) {
    console.log(`\n  ---- Failures ----`);
    failures.forEach((f) => {
      console.log(`  Test ${f.label}:`);
      f.failed.forEach((m) => console.log(`    ❌ ${m}`));
    });
  }

  console.log(`\n${'━'.repeat(70)}\n`);

  process.exit(failCount > 0 ? 1 : 0);
};

main().catch((err) => {
  if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch')) {
    console.error('\n  ❌ Server not running. Start with: npm run dev\n');
  } else {
    console.error('Fatal error:', err);
  }
  process.exit(1);
});
