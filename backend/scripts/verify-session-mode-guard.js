/**
 * verify-session-mode-guard.js
 *
 * Targeted reproduction + regression check for the A2/E1 cross-mode session
 * corruption bug (GLOBAL_MODE_VERIFICATION_CHECKLIST.md) and its fix in
 * step2.loadSession.js's mode-mismatch guard.
 *
 * Calls askQuestion() directly (same in-process pattern as verify-focus-mode.js)
 * rather than HTTP, to avoid this machine's known SSE-streaming/fetch issue.
 *
 * Usage: node scripts/verify-session-mode-guard.js
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { askQuestion } from '../src/ask/askOrchestrator.js';
import { loadCurriculumIndex } from '../src/curriculum/curriculumIndexLoader.js';
import { updateChatSessionState } from '../src/services/chatSession.service.js';

const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq free tier caps at 6000 TPM — same retry pattern as verify-focus-mode.js's
// askTurn(), since askQuestion() itself does not retry on provider errors, it just
// returns an error payload (session.sessionId would be undefined on that turn).
const askWithRetry = async (body, ctx) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await askQuestion(body, ctx);
    if (result?.session?.sessionId) return result;
    console.log(YELLOW(`    (provider_error on attempt ${attempt}/3, retrying after 15s: "${body.question}")`));
    await sleep(15000);
  }
  return askQuestion(body, ctx); // final attempt, let it fail visibly if still rate-limited
};

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? GREEN('PASS') : RED('FAIL')} — ${name}${detail ? `  (${detail})` : ''}`);
};

const resolveLightChapter = async () => {
  const index = await loadCurriculumIndex();
  for (const subject of index.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        const title = chapter.title.toLowerCase();
        if (title.includes('light') && title.includes('reflection')) return chapter;
      }
    }
  }
  throw new Error('Could not resolve Light chapter from curriculum index.');
};

const main = async () => {
  console.log(BOLD('\n=== Session Mode-Mismatch Guard Verification ===\n'));
  await connectDB();

  const lightChapter = await resolveLightChapter();
  const guestId = `mode-guard-test-${randomUUID()}`;

  // ── Root-cause pin: updateChatSessionState() must NEVER create a session ──
  // This is the exact mechanism that used to silently mislabel a session's
  // sessionType as the schema default ('global') whenever a provider error
  // hit on a session's very first turn (before step7 ever ran). Confirmed
  // directly against the DB, not indirectly through askQuestion().
  const neverUsedSessionId = randomUUID();
  await updateChatSessionState(neverUsedSessionId, { consecutiveErrors: 1, lastErrorAt: new Date() });
  const phantomDoc = await ChatSession.findOne({ sessionId: neverUsedSessionId }).lean();
  record('updateChatSessionState() does NOT create a session for a non-existent sessionId', !phantomDoc, `doc=${phantomDoc ? 'CREATED (bug!)' : 'none (correct)'}`);

  // ── Direction 1: focus -> global on the SAME sessionId ──────────────────
  const session1 = randomUUID();

  await askWithRetry(
    { question: 'Reflection kya hota hai?', studyMode: 'focus', sessionId: session1, chapterId: lightChapter.chapterId },
    { userId: null, guestId }
  );

  const beforeDoc = await ChatSession.findOne({ sessionId: session1 }).lean();
  record('Focus session created with sessionType=focus', beforeDoc?.sessionType === 'focus', `sessionType=${beforeDoc?.sessionType}`);
  record('Focus session has chapter populated before mismatch', !!beforeDoc?.chatState?.currentChapterId, `currentChapterId=${beforeDoc?.chatState?.currentChapterId}`);

  const mismatchResult1 = await askWithRetry(
    { question: 'Photosynthesis kya hai?', studyMode: 'global', sessionId: session1 },
    { userId: null, guestId }
  );

  const returnedSessionId1 = mismatchResult1?.session?.sessionId;
  record('Mismatched request returns a DIFFERENT sessionId', returnedSessionId1 && returnedSessionId1 !== session1, `sent=${session1} got=${returnedSessionId1}`);

  const afterDoc1 = await ChatSession.findOne({ sessionId: session1 }).lean();
  record('Original focus session sessionType UNCHANGED after mismatch', afterDoc1?.sessionType === 'focus', `sessionType=${afterDoc1?.sessionType}`);
  record('Original focus session chapter data UNCHANGED after mismatch (no corruption)',
    afterDoc1?.chatState?.currentChapterId === beforeDoc?.chatState?.currentChapterId,
    `before=${beforeDoc?.chatState?.currentChapterId} after=${afterDoc1?.chatState?.currentChapterId}`);

  const newDoc1 = await ChatSession.findOne({ sessionId: returnedSessionId1 }).lean();
  record('New auto-created session has sessionType=global', newDoc1?.sessionType === 'global', `sessionType=${newDoc1?.sessionType}`);
  record('New auto-created session has NO chapter data (clean global session)', !newDoc1?.chatState?.currentChapterId, `currentChapterId=${newDoc1?.chatState?.currentChapterId}`);

  // ── Direction 2: global -> focus on the SAME sessionId ───────────────────
  const session2 = randomUUID();

  await askWithRetry(
    { question: 'Photosynthesis kya hai?', studyMode: 'global', sessionId: session2 },
    { userId: null, guestId }
  );

  const beforeDoc2 = await ChatSession.findOne({ sessionId: session2 }).lean();
  record('Global session created with sessionType=global', beforeDoc2?.sessionType === 'global', `sessionType=${beforeDoc2?.sessionType}`);

  const mismatchResult2 = await askWithRetry(
    { question: 'Reflection kya hota hai?', studyMode: 'focus', sessionId: session2, chapterId: lightChapter.chapterId },
    { userId: null, guestId }
  );

  const returnedSessionId2 = mismatchResult2?.session?.sessionId;
  record('Reverse mismatch also returns a DIFFERENT sessionId', returnedSessionId2 && returnedSessionId2 !== session2, `sent=${session2} got=${returnedSessionId2}`);

  const afterDoc2 = await ChatSession.findOne({ sessionId: session2 }).lean();
  record('Original global session sessionType UNCHANGED after reverse mismatch', afterDoc2?.sessionType === 'global', `sessionType=${afterDoc2?.sessionType}`);
  record('Original global session got NO chapter data leaked into it', !afterDoc2?.chatState?.currentChapterId, `currentChapterId=${afterDoc2?.chatState?.currentChapterId}`);

  const newDoc2 = await ChatSession.findOne({ sessionId: returnedSessionId2 }).lean();
  record('New auto-created session has sessionType=focus', newDoc2?.sessionType === 'focus', `sessionType=${newDoc2?.sessionType}`);
  record('New auto-created session has chapter data populated correctly', newDoc2?.chatState?.currentChapterId === lightChapter.chapterId, `currentChapterId=${newDoc2?.chatState?.currentChapterId}`);

  // ── Regression: SAME-mode turns must NOT trigger the guard ───────────────
  const session3 = randomUUID();
  const r1 = await askWithRetry(
    { question: 'Reflection kya hota hai?', studyMode: 'focus', sessionId: session3, chapterId: lightChapter.chapterId },
    { userId: null, guestId }
  );
  const r2 = await askWithRetry(
    { question: 'Aage badhao', studyMode: 'focus', sessionId: session3, chapterId: lightChapter.chapterId },
    { userId: null, guestId }
  );
  record('Consistent focus-mode turns keep the SAME sessionId (no false-positive guard trigger)',
    r1?.session?.sessionId === session3 && r2?.session?.sessionId === session3,
    `turn1=${r1?.session?.sessionId} turn2=${r2?.session?.sessionId}`);

  // ── Cleanup ────────────────────────────────────────────────────────────
  await ChatSession.deleteMany({ sessionId: { $in: [session1, session2, session3, returnedSessionId1, returnedSessionId2].filter(Boolean) } });

  console.log(BOLD('\n=== SUMMARY ==='));
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`Total: ${results.length}  ${GREEN(`PASS: ${pass}`)}  ${fail > 0 ? RED(`FAIL: ${fail}`) : `FAIL: 0`}`);

  await disconnectDB();
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
