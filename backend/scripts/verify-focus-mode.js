/**
 * verify-focus-mode.js
 *
 * Automated multi-turn verification for Focus Mode — reuses run-golden-set.js's
 * HTTP-call pattern, but drives fixed-sessionId multi-turn sequences and asserts
 * on suggestedActions / chapterProgress fields (and direct MongoDB reads), not
 * just a single-turn intent check.
 *
 * Covers FOCUS_MODE_VERIFICATION_CHECKLIST.md sections A (minus the guest line),
 * B, C, D — the four tied to confirmed, previously-real bugs (BUG-1, BUG-6, BUG-5,
 * BUG-4). Sections E-H are a deliberate v2, added once this v1 proves out.
 *
 * Server MUST be running (npm run dev) before calling this.
 *
 * Usage:
 *   node scripts/verify-focus-mode.js          -> quick suite (sections A, C, D)
 *   node scripts/verify-focus-mode.js --full   -> quick + section B's BUG-6 decimal-topic
 *                                                  walk (slow: ~8 extra /ask calls)
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import User from '../src/models/user.model.js';
import { ChapterProgress } from '../src/models/chapterProgress.model.js';
import { loadCurriculumIndex } from '../src/curriculum/curriculumIndexLoader.js';
import { getChapterCoreTopics } from '../src/curriculum/topicResolver.js';

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;
const FULL_RUN = process.argv.includes('--full');

const TEST_EMAIL = 'focus-mode-verify@zuno.internal';
const TEST_PASSWORD = 'FocusModeVerify123';

// Safely under askApiLimiter's 30/min per-IP cap.
const ASK_DELAY_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ANSI colour helpers (same pattern as run-golden-set.js) ──────────────────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

// ── Result tracking ───────────────────────────────────────────────────────────
const results = [];
const record = (section, name, pass, detail = '') => {
  results.push({ section, name, pass, detail });
  const tag = pass ? GREEN('PASS') : RED('FAIL');
  console.log(`  [${section}] ${tag} — ${name}${detail ? `  (${detail})` : ''}`);
};

// ── HTTP helpers ───────────────────────────────────────────────────────────────
let accessToken = null;

// The /ask endpoint responds via SSE (text/event-stream) whenever the tutor LLM
// actually streams a real answer (USE_INTENT_ROUTER=true routes almost every
// academic turn through routeToIntentHandler's streamCallbacks.onStreamStart()).
// Plain JSON only comes back for the two deterministic no-LLM branches
// (CHAPTER_COMPLETE, out-of-focus redirect) or on error. Parsing mirrors
// frontend/src/api/tutorApi.js's askTutor() exactly — same event framing,
// same "data: {...}" line splitting, same event:'end' -> payload extraction.
const askTurn = async ({ question, studyMode, sessionId, chapterId }) => {
  const body = { question, studyMode, sessionId };
  if (chapterId) body.chapterId = chapterId;

  const res = await fetch(`${BASE_URL}/api/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  let payload;

  if (contentType.includes('text/event-stream')) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    payload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.replace(/^data:\s*/, '').trim();
        if (!dataStr) continue;
        const dataObj = JSON.parse(dataStr);
        if (dataObj.event === 'end') {
          payload = dataObj.payload;
          break;
        }
      }
    }
  } else {
    const json = await res.json();
    payload = json.data ?? json;
  }

  await sleep(ASK_DELAY_MS);
  return payload;
};

const getChapterProgressHttp = async (chapterId) => {
  const res = await fetch(`${BASE_URL}/api/v1/chapter-progress/${chapterId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  return json.data ?? json;
};

// ── Setup: test user + login ──────────────────────────────────────────────────
const setupTestUser = async () => {
  // Upsert with $set (not $setOnInsert) so the account is always in a known-good
  // state regardless of what a previous run left behind.
  await User.findOneAndUpdate(
    { email: TEST_EMAIL },
    {
      $set: {
        name: 'Focus Mode Verify',
        email: TEST_EMAIL,
        // bcrypt embeds its own salt/rounds in the hash — login()'s bcrypt.compare()
        // works regardless of what rounds value created this hash.
        passwordHash: await (await import('bcrypt')).default.hash(TEST_PASSWORD, 10),
        authProvider: 'email',
        isEmailVerified: true,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const json = await res.json();
  if (!json?.data?.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(json)}`);
  }
  return { accessToken: json.data.accessToken, userId: json.data.user.id };
};

// ── Chapter resolution (dynamic — never hardcode an assumed chapterId/slug) ───
const resolveChapters = async () => {
  const index = await loadCurriculumIndex();
  let lightChapter = null;
  let chemReactionsChapter = null;
  let bioChapter = null;
  let bioTopic = null;

  for (const subject of index.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        const title = chapter.title.toLowerCase();
        if (!lightChapter && title.includes('light') && title.includes('reflection')) {
          lightChapter = chapter;
        }
        if (!chemReactionsChapter && title.includes('chemical reaction')) {
          chemReactionsChapter = chapter;
        }
        if (!bioChapter && section.title.toLowerCase() === 'biology') {
          bioChapter = chapter;
        }
      }
    }
  }

  if (!lightChapter) throw new Error('Could not resolve the Light/Reflection chapter from curriculum index.');
  if (!bioChapter) throw new Error('Could not resolve a Biology chapter from curriculum index.');

  const bioTopics = getChapterCoreTopics(index, bioChapter.chapterId);
  bioTopic = bioTopics[0];

  return { lightChapter, chemReactionsChapter, bioChapter, bioTopic, index };
};

// ── DB fixtures (direct Mongoose writes — bypass HTTP for setup/teardown only,
//    never for the actual assertions being tested) ───────────────────────────
const clearProgress = (userId, chapterId) =>
  ChapterProgress.deleteOne({ userId, chapterId });

const setProgressStatus = (userId, chapterId, fields) =>
  ChapterProgress.findOneAndUpdate({ userId, chapterId }, { $set: fields }, { upsert: true });

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A — Session lifecycle & resume (BUG-1 / BUG-2 class)
// ═══════════════════════════════════════════════════════════════════════════
const runSectionA = async (userId, chapters) => {
  console.log(BOLD('\n── SECTION A: Session lifecycle & resume ──'));
  const { lightChapter } = chapters;
  const chapterId = lightChapter.chapterId;

  await clearProgress(userId, chapterId);

  // A1: fresh chapter -> recommendation.action === 'start'
  const fresh = await getChapterProgressHttp(chapterId);
  record('A', 'Fresh chapter recommendation is "start" with next_step+chapter_overview chips',
    fresh?.recommendation?.action === 'start' &&
    fresh.recommendation.chips.some((c) => c.type === 'next_step') &&
    fresh.recommendation.chips.some((c) => c.type === 'chapter_overview'),
    `action=${fresh?.recommendation?.action}`);

  // A2: NEXT_STEP advances topic 1, then recommendation becomes "resume"
  const session1 = randomUUID();
  await askTurn({ question: 'Shuru karo', studyMode: 'focus', sessionId: session1, chapterId });
  const afterStart = await getChapterProgressHttp(chapterId);
  record('A', 'In-progress chapter recommendation is "resume" with continue_step+restart_topic+roadmap chips',
    afterStart?.recommendation?.action === 'resume' &&
    afterStart.recommendation.chips.some((c) => c.type === 'continue_step') &&
    afterStart.recommendation.chips.some((c) => c.type === 'restart_topic') &&
    afterStart.recommendation.chips.some((c) => c.type === 'roadmap'),
    `action=${afterStart?.recommendation?.action}`);

  const topic1Id = afterStart?.progress?.currentTopicId;

  // A3: BUG-1 regression — brand-new session, same chapter, NEXT_STEP resumes
  // from topic 2, not topic 1.
  const session2 = randomUUID();
  const secondAdvance = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: session2, chapterId });
  const topic2Id = secondAdvance?.chapterProgress?.currentTopicId;
  record('A', 'New session resumes from the next topic, not topic 1 (BUG-1 regression guard)',
    topic2Id && topic2Id !== topic1Id,
    `topic1=${topic1Id} topic2=${topic2Id}`);

  // A4: "completed" state recommendation — seed directly (avoid a full multi-turn
  // drain just to exercise the recommendation renderer).
  await setProgressStatus(userId, chapterId, { status: 'completed', completedAt: new Date() });
  const completed = await getChapterProgressHttp(chapterId);
  record('A', '"completed" chapter recommendation offers revise_chapter+switch_chapter',
    completed?.recommendation?.action === 'revise' &&
    completed.recommendation.chips.some((c) => c.type === 'revise_chapter') &&
    completed.recommendation.chips.some((c) => c.type === 'switch_chapter'),
    `action=${completed?.recommendation?.action}`);

  // A5: "revising" state recommendation behaves like fresh-start
  await setProgressStatus(userId, chapterId, { status: 'revising', currentTopicId: null });
  const revising = await getChapterProgressHttp(chapterId);
  record('A', '"revising" chapter recommendation behaves like fresh-start (next_step+chapter_overview)',
    revising?.recommendation?.action === 'start' &&
    revising.recommendation.chips.some((c) => c.type === 'next_step'),
    `action=${revising?.recommendation?.action}`);

  await clearProgress(userId, chapterId);
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION B — Topic advancement (NEXT_STEP)
// ═══════════════════════════════════════════════════════════════════════════
const runSectionB = async (userId, chapters, index) => {
  console.log(BOLD('\n── SECTION B: Topic advancement (NEXT_STEP) ──'));
  const { lightChapter } = chapters;
  const chapterId = lightChapter.chapterId;
  const coreTopics = getChapterCoreTopics(index, chapterId);

  await clearProgress(userId, chapterId);

  // B1: fresh chapter, first NEXT_STEP teaches topic 1
  const session = randomUUID();
  const first = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: session, chapterId });
  record('B', 'Fresh chapter NEXT_STEP teaches topic 1',
    first?.chapterProgress?.currentTopicId === coreTopics[0].topicId,
    `got=${first?.chapterProgress?.currentTopicId} expected=${coreTopics[0].topicId}`);

  // B5: stale/unresolvable currentTopicId regression guard (the fix made 2026-07-10) —
  // exercised through the REAL HTTP path this time, not just the standalone unit test.
  await setProgressStatus(userId, chapterId, { currentTopicId: 'bogus-stale-topic-id-xyz' });
  const staleTurn = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: randomUUID(), chapterId });
  record('B', 'Stale/unresolvable currentTopicId resyncs to topic 1, does NOT report chapter_complete',
    staleTurn?.chapterProgress?.status !== 'completed' &&
    staleTurn?.chapterProgress?.currentTopicId === coreTopics[0].topicId,
    `status=${staleTurn?.chapterProgress?.status} topic=${staleTurn?.chapterProgress?.currentTopicId}`);

  // B3/B4: walk to the final topic and confirm CHAPTER_COMPLETE — only in --full
  // mode (this alone is ~N extra /ask calls for an N-topic chapter).
  if (FULL_RUN) {
    await clearProgress(userId, chapterId);
    const seenTopicIds = new Set();
    let last;
    for (let i = 0; i < coreTopics.length; i++) {
      last = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: randomUUID(), chapterId });
      const tid = last?.chapterProgress?.currentTopicId;
      if (tid) seenTopicIds.add(tid);
    }
    record('B', `completedTopicIds grows by exactly one per advance, no duplicates (${coreTopics.length} topics)`,
      seenTopicIds.size === coreTopics.length,
      `distinct topics seen=${seenTopicIds.size}/${coreTopics.length}`);

    const finalTurn = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: randomUUID(), chapterId });
    const dbDoc = await ChapterProgress.findOne({ userId, chapterId }).lean();
    record('B', 'Final NEXT_STEP -> CHAPTER_COMPLETE, chips exactly [switch_chapter, global_mode], status=completed/100%/completedAt set',
      finalTurn?.chapterProgress?.status === 'completed' &&
      finalTurn?.chapterProgress?.progressPercent === 100 &&
      dbDoc?.completedAt != null &&
      finalTurn?.suggestedActions?.length === 2 &&
      finalTurn.suggestedActions.some((a) => a.type === 'switch_chapter') &&
      finalTurn.suggestedActions.some((a) => a.type === 'global_mode') &&
      !finalTurn.suggestedActions.some((a) => a.type === 'next_topic'),
      `status=${finalTurn?.chapterProgress?.status} chips=${JSON.stringify(finalTurn?.suggestedActions)}`);
  } else {
    console.log(YELLOW('  [B] SKIPPED full chapter-drain + BUG-6 decimal-topic walk (run with --full to include)'));
  }

  await clearProgress(userId, chapterId);
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION C — Suggested-action chip guarantees (BUG-5 class)
// ═══════════════════════════════════════════════════════════════════════════
const runSectionC = async (userId, chapters) => {
  console.log(BOLD('\n── SECTION C: Suggested-action chip guarantees ──'));
  const { lightChapter } = chapters;
  const chapterId = lightChapter.chapterId;
  await clearProgress(userId, chapterId);

  const session = randomUUID();

  // Seed a NEXT_STEP turn first so there's real retrieved content to ask a
  // CONCEPT_QUESTION follow-up against.
  await askTurn({ question: 'Shuru karo', studyMode: 'focus', sessionId: session, chapterId });

  const concept = await askTurn({ question: 'Reflection ka law kya hai?', studyMode: 'focus', sessionId: session, chapterId });
  record('C', 'CONCEPT_QUESTION always includes injected next_topic chip alongside related_concept',
    concept?.suggestedActions?.some((a) => a.type === 'next_topic') &&
    concept?.suggestedActions?.some((a) => a.type === 'related_concept'),
    `chips=${JSON.stringify(concept?.suggestedActions)}`);

  const explain = await askTurn({ question: 'Samajh nahi aaya, simple bhasha mein samjhao', studyMode: 'focus', sessionId: session, chapterId });
  record('C', 'EXPLAIN_MORE always includes injected next_topic chip (prompt itself emits none)',
    explain?.suggestedActions?.length >= 1 && explain.suggestedActions.some((a) => a.type === 'next_topic'),
    `chips=${JSON.stringify(explain?.suggestedActions)}`);

  const examInfo = await askTurn({ question: 'Physics ke kitne marks hote hain exam mein?', studyMode: 'focus', sessionId: session, chapterId });
  record('C', 'EXAM_INFO includes injected next_topic AND its own related_concept chip (no type collision)',
    examInfo?.suggestedActions?.some((a) => a.type === 'next_topic') &&
    examInfo?.suggestedActions?.some((a) => a.type === 'related_concept'),
    `chips=${JSON.stringify(examInfo?.suggestedActions)}`);

  const nextStep = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: session, chapterId });
  record('C', 'Mid-chapter NEXT_STEP includes next_topic chip',
    nextStep?.suggestedActions?.some((a) => a.type === 'next_topic'),
    `chips=${JSON.stringify(nextStep?.suggestedActions)}`);

  await clearProgress(userId, chapterId);
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION D — Cross-chapter isolation (BUG-4 class)
// ═══════════════════════════════════════════════════════════════════════════
const runSectionD = async (userId, chapters) => {
  console.log(BOLD('\n── SECTION D: Cross-chapter isolation ──'));
  const { lightChapter, bioTopic } = chapters;
  const chapterId = lightChapter.chapterId;
  await clearProgress(userId, chapterId);

  const session = randomUUID();
  const offChapterQuestion = `${bioTopic.title} kaise hoti hai, detail mein samjhao`;

  const redirect = await askTurn({ question: offChapterQuestion, studyMode: 'focus', sessionId: session, chapterId });
  record('D', 'Off-chapter CONCEPT_QUESTION redirects ("doosre chapter mein hai"), does not teach directly',
    redirect?.title === 'Yeh topic doosre chapter mein hai' ||
    /doosre chapter/i.test(redirect?.answer || ''),
    `title=${redirect?.title}`);

  const explainAfterRedirect = await askTurn({ question: 'Samajh nahi aaya', studyMode: 'focus', sessionId: session, chapterId });
  record('D', 'EXPLAIN_MORE right after an out-of-focus redirect asks for clarification, does NOT teach the other chapter (BUG-4 reproduction case)',
    explainAfterRedirect?.status === 'needs_clarification',
    `status=${explainAfterRedirect?.status}`);

  // Regression check: genuine on-chapter flow still works normally
  const session2 = randomUUID();
  const onChapter = await askTurn({ question: 'Reflection kya hota hai light ka?', studyMode: 'focus', sessionId: session2, chapterId });
  const onChapterExplain = await askTurn({ question: 'Aur simple karke samjhao', studyMode: 'focus', sessionId: session2, chapterId });
  record('D', 'Genuine on-chapter CONCEPT_QUESTION + EXPLAIN_MORE still correctly re-explains the same chapter',
    onChapter?.status === 'answered' && onChapter?.sources?.length > 0 &&
    onChapterExplain?.status === 'answered' && onChapterExplain?.sources?.length > 0,
    `q1_status=${onChapter?.status} q2_status=${onChapterExplain?.status}`);

  await clearProgress(userId, chapterId);
};

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
const main = async () => {
  console.log(BOLD('\n══════════════════════════════════════════════════════'));
  console.log(BOLD('  FOCUS MODE VERIFICATION SCRIPT'));
  console.log(BOLD('══════════════════════════════════════════════════════'));
  console.log(`  Server : ${BASE_URL}`);
  console.log(`  Mode   : ${FULL_RUN ? 'FULL (includes BUG-6 decimal-topic walk)' : 'QUICK (sections A, C, D)'}`);

  try {
    const ping = await fetch(`${BASE_URL}/health`);
    if (!ping.ok) throw new Error(`Health check returned ${ping.status}`);
    console.log(GREEN('  ✓ Server is reachable'));
  } catch {
    console.log(RED(`  ✗ Server not reachable at ${BASE_URL}`));
    console.log(YELLOW('    → Start the server first: cd backend && npm run dev'));
    process.exit(1);
  }

  await connectDB();

  try {
    const { accessToken: token, userId } = await setupTestUser();
    accessToken = token;
    console.log(GREEN(`  ✓ Test user ready (${TEST_EMAIL})`));

    const chapters = await resolveChapters();
    console.log(GREEN(`  ✓ Resolved chapters: Light="${chapters.lightChapter.title}", Biology="${chapters.bioChapter.title}"`));

    await runSectionA(userId, chapters);
    await runSectionB(userId, chapters, chapters.index);
    await runSectionC(userId, chapters);
    await runSectionD(userId, chapters);

    // Final cleanup — leave no test data behind for either chapter touched.
    await clearProgress(userId, chapters.lightChapter.chapterId);

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;

    console.log(BOLD('\n══════════════════════════════════════════════════════'));
    console.log(BOLD('  SUMMARY'));
    console.log('══════════════════════════════════════════════════════');
    console.log(`  Total  : ${results.length}`);
    console.log(`  ${GREEN('PASS')}   : ${passed}`);
    console.log(`  ${RED('FAIL')}   : ${failed}`);
    console.log('══════════════════════════════════════════════════════\n');

    if (failed > 0) {
      console.log(BOLD('  Failures:'));
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`  ${RED('✗')} [${r.section}] ${r.name} — ${r.detail}`);
      }
      console.log();
    }

    await disconnectDB();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(RED('\n[verify-focus-mode] Unexpected error:'), err);
    await disconnectDB();
    process.exit(1);
  }
};

main();
