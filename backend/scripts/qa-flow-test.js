/**
 * QA Flow Test — tests the complete Ask API pipeline step by step.
 * Sends real messages and checks each stage of the flow.
 */

const API_BASE = 'http://localhost:5000';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let sessionId = null;
let testNumber = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

const log = (label, value) => {
  if (typeof value === 'object') {
    console.log(`  ${label}:`, JSON.stringify(value, null, 2));
  } else {
    console.log(`  ${label}: ${value}`);
  }
};

const askQuestion = async ({ question, studyMode = 'global', chapterId = null }) => {
  const body = { question, studyMode };

  if (sessionId) {
    body.sessionId = sessionId;
  }

  if (chapterId) {
    body.chapterId = chapterId;
  }

  const startTime = Date.now();

  const response = await fetch(`${API_BASE}/api/v1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - startTime;
  const data = await response.json();

  return { status: response.status, elapsed, data };
};

const runTest = async (title, { question, studyMode, chapterId, checks }) => {
  testNumber++;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST ${testNumber}: ${title}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Question: "${question}"`);
  console.log(`  Study Mode: ${studyMode || 'global'}`);

  if (chapterId) {
    console.log(`  Chapter ID: ${chapterId}`);
  }

  try {
    const result = await askQuestion({ question, studyMode, chapterId });
    const payload = result.data?.data || result.data;

    console.log(`\n  --- Response Summary ---`);
    log('HTTP Status', result.status);
    log('Latency', `${result.elapsed}ms`);
    log('API Status', payload?.status);
    log('Response Mode', payload?.responseMode);
    log('Detected Language', payload?.detectedLanguage);
    log('Answer Language', payload?.answerLanguage);
    log('Title', payload?.title || '(none)');
    log('Sections Count', payload?.sections?.length || 0);

    if (payload?.sections) {
      payload.sections.forEach((section, i) => {
        console.log(`  Section ${i + 1}: [${section.heading}] ${section.content?.substring(0, 120)}...`);
      });
    }

    log('Answer (first 200 chars)', (payload?.answer || '').substring(0, 200));
    log('Sources Count', payload?.sources?.length || 0);

    if (payload?.sources?.length) {
      payload.sources.forEach((source, i) => {
        console.log(`    Source ${i + 1}: ${source.label || source.sourceTitle || 'unnamed'} — ${source.chapterTitle || ''}`);
      });
    }

    log('Suggested Actions', payload?.suggestedActions?.length || 0);
    log('Decision', payload?.decision);
    log('Session ID', payload?.session?.sessionId);

    // Update session for follow-up tests
    if (payload?.session?.sessionId) {
      sessionId = payload.session.sessionId;
    }

    // Run checks
    const testPassed = [];
    const testFailed = [];

    for (const [checkName, checkFn] of Object.entries(checks || {})) {
      try {
        const checkResult = checkFn(payload, result);

        if (checkResult === true) {
          testPassed.push(checkName);
        } else {
          testFailed.push(`${checkName}: ${checkResult}`);
        }
      } catch (error) {
        testFailed.push(`${checkName}: EXCEPTION — ${error.message}`);
      }
    }

    console.log(`\n  --- Checks ---`);

    testPassed.forEach((name) => console.log(`  ✅ ${name}`));
    testFailed.forEach((msg) => console.log(`  ❌ ${msg}`));

    if (testFailed.length === 0) {
      passCount++;
      console.log(`\n  ✅ TEST ${testNumber} PASSED`);
    } else {
      failCount++;
      failures.push({ test: testNumber, title, failed: testFailed });
      console.log(`\n  ❌ TEST ${testNumber} FAILED`);
    }
  } catch (error) {
    failCount++;
    failures.push({ test: testNumber, title, failed: [`NETWORK ERROR: ${error.message}`] });
    console.log(`  ❌ TEST ${testNumber} CRASHED: ${error.message}`);
  }
};

// ---- Tests ----

const main = async () => {
  console.log('\n🧪 Bihar Board AI Tutor — Complete Ask API Flow Test');
  console.log('━'.repeat(70));

  // TEST 1: Simple greeting (no RAG needed)
  await runTest('Greeting — No RAG expected', {
    question: 'Hello Zuno!',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Status is answered': (p) => p.status === 'answered' || `got ${p.status}`,
      'Response mode is conversation': (p) => p.responseMode === 'conversation' || `got ${p.responseMode}`,
      'Has sections': (p) => (p.sections?.length > 0) || 'no sections',
      'No retrieval needed': (p) => p.decision?.needsRetrieval === false || `got ${p.decision?.needsRetrieval}`,
      'Session returned': (p) => !!p.session?.sessionId || 'no session',
      'Answer not empty': (p) => (p.answer?.length > 5) || 'answer empty',
      'Latency < 30s': (p, r) => r.elapsed < 30000 || `took ${r.elapsed}ms`,
    },
  });

  await delay(2000);

  // TEST 2: Hindi science question (RAG needed)
  await runTest('Hindi Science Question — RAG retrieval expected', {
    question: 'प्रकाश का परावर्तन क्या होता है?',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Status is answered': (p) => p.status === 'answered' || `got ${p.status}`,
      'Response mode is study_tutor': (p) => p.responseMode === 'study_tutor' || `got ${p.responseMode}`,
      'RAG retrieval happened': (p) => p.decision?.needsRetrieval === true || `got ${p.decision?.needsRetrieval}`,
      'Has retrieved chunks': (p) => (p.retrieval?.returnedCount > 0) || `got ${p.retrieval?.returnedCount}`,
      'Has sources': (p) => (p.sources?.length > 0) || 'no sources',
      'Has sections': (p) => (p.sections?.length > 0) || 'no sections',
      'Same session reused': (p) => p.session?.sessionId === sessionId || 'session changed',
      'Latency < 45s': (p, r) => r.elapsed < 45000 || `took ${r.elapsed}ms`,
    },
  });

  await delay(2000);

  // TEST 3: Hinglish question (language detection test)
  await runTest('Hinglish Question — Language detection + RAG', {
    question: 'Chemical reaction kya hoti hai? simple me samjhao',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Status is answered or insufficient': (p) =>
        ['answered', 'insufficient_context'].includes(p.status) || `got ${p.status}`,
      'Response mode is study_tutor': (p) => p.responseMode === 'study_tutor' || `got ${p.responseMode}`,
      'Language detected': (p) => !!p.detectedLanguage || 'no language detected',
      'RAG retrieval happened': (p) => p.decision?.needsRetrieval === true || `got ${p.decision?.needsRetrieval}`,
      'Has answer': (p) => (p.answer?.length > 10) || 'answer too short',
      'Session continuity': (p) => p.session?.sessionId === sessionId || 'session changed',
    },
  });

  await delay(2000);

  // TEST 4: Follow-up (context from memory/history)
  await runTest('Follow-up Question — Needs memory/history context', {
    question: 'Iska ek example do',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Status is answered or insufficient': (p) =>
        ['answered', 'insufficient_context'].includes(p.status) || `got ${p.status}`,
      'Has answer': (p) => (p.answer?.length > 10) || 'answer too short',
      'Session continuity': (p) => p.session?.sessionId === sessionId || 'session changed',
    },
  });

  await delay(2000);

  // TEST 5: Focus Mode question
  await runTest('Focus Mode — Scoped to Biology Chapter 1', {
    question: 'Nutrition kya hota hai?',
    studyMode: 'focus',
    chapterId: 'science.biology.chapter-01',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Status is answered': (p) => p.status === 'answered' || `got ${p.status}`,
      'Response mode is study_tutor': (p) => p.responseMode === 'study_tutor' || `got ${p.responseMode}`,
      'RAG retrieval happened': (p) => p.decision?.needsRetrieval === true || `got ${p.decision?.needsRetrieval}`,
      'Has sources': (p) => (p.sources?.length > 0) || 'no sources',
      'Session continuity': (p) => p.session?.sessionId === sessionId || 'session changed',
    },
  });

  await delay(2000);

  // TEST 6: Out-of-scope question
  await runTest('Out-of-scope Question — Should redirect', {
    question: 'IPL me kis team ne jita kal?',
    studyMode: 'global',
    checks: {
      'HTTP 200': (p, r) => r.status === 200 || `got ${r.status}`,
      'Response mode is redirect': (p) => p.responseMode === 'redirect' || `got ${p.responseMode}`,
      'No RAG retrieval': (p) => p.decision?.needsRetrieval === false || `got ${p.decision?.needsRetrieval}`,
      'In-scope is false': (p) => p.decision?.inScope === false || `got ${p.decision?.inScope}`,
    },
  });

  await delay(1000);

  // TEST 7: Invalid request — missing question
  testNumber++;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST ${testNumber}: Validation — Missing question`);
  console.log(`${'='.repeat(70)}`);

  try {
    const response = await fetch(`${API_BASE}/api/v1/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studyMode: 'global' }),
    });

    const data = await response.json();

    if (response.status === 400) {
      passCount++;
      console.log(`  ✅ Correctly returned 400: ${data.message || data.error}`);
    } else {
      failCount++;
      failures.push({ test: testNumber, title: 'Missing question validation', failed: [`Expected 400 got ${response.status}`] });
      console.log(`  ❌ Expected 400 got ${response.status}`);
    }
  } catch (error) {
    failCount++;
    failures.push({ test: testNumber, title: 'Missing question validation', failed: [error.message] });
    console.log(`  ❌ CRASHED: ${error.message}`);
  }

  // ---- Summary ----
  console.log(`\n\n${'━'.repeat(70)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'━'.repeat(70)}`);
  console.log(`  Total:  ${testNumber}`);
  console.log(`  Passed: ${passCount} ✅`);
  console.log(`  Failed: ${failCount} ❌`);

  if (failures.length > 0) {
    console.log(`\n  ---- Failures ----`);
    failures.forEach((f) => {
      console.log(`  Test ${f.test} (${f.title}):`);
      f.failed.forEach((msg) => console.log(`    ❌ ${msg}`));
    });
  }

  console.log(`\n${'━'.repeat(70)}\n`);

  process.exit(failCount > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
