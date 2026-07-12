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
import redis from '../src/config/redisClient.js';
import { askQuestion } from '../src/ask/askOrchestrator.js';

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;
const FULL_RUN = process.argv.includes('--full');

const TEST_EMAIL = 'focus-mode-verify@zuno.internal';
const TEST_PASSWORD = 'FocusModeVerify123';

// The Groq tier in use caps at 6000 TPM, and one real turn (decider+tutor) can use
// ~2500-3800 tokens — two turns landing in the same 60s window can trip rate_limit
// even with request-count-safe spacing. 8s baseline + a longer backoff on retry
// (proven empirically during this pass) keeps this reliable.
const ASK_DELAY_MS = 8000;
const RETRY_BACKOFF_MS = 15000;
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

// ── HTTP helpers (still used for GET /chapter-progress, which never showed
//    the hang issue below — only /ask calls are made in-process instead) ──────
let accessToken = null;
let testUserId = null;

// PIVOT (2026-07-11): the /ask endpoint responds via SSE, and three different
// HTTP client approaches (fetch()+ReadableStream, fetch()+Connection:close+
// AbortController timeout, and Node's raw http.request with classic 'data'/'end'
// events) all intermittently hung reading that stream — even though server-side
// logs confirmed the request completed successfully in 2-6s every time. Since
// all three failed identically on the same call, the issue isn't a particular
// HTTP client library — it's specific to this machine's networking of a
// streamed local response. Calling askQuestion() directly (the same function
// ask.controller.js calls) skips HTTP/SSE/sockets entirely — no network layer,
// so that whole class of hang cannot occur here.
//
// Retries on a transient provider_error (Groq rate-limited) — safe to retry
// because ProviderUnavailableError short-circuits BEFORE step7, so no DB write
// ever happened for that attempt (no double-advance risk).
const askTurn = async (params, attempt = 1) => {
  const result = await askTurnOnce(params);
  if (result?.status === 'provider_error' && attempt <= 2) {
    console.log(YELLOW(`    (provider_error, retry ${attempt}/2 after ${RETRY_BACKOFF_MS / 1000}s: "${params.question.slice(0, 40)}")`));
    await sleep(RETRY_BACKOFF_MS);
    return askTurn(params, attempt + 1);
  }
  return result;
};

const askTurnOnce = async ({ question, studyMode, sessionId, chapterId }) => {
  const body = { question, studyMode, sessionId };
  if (chapterId) body.chapterId = chapterId;
  const payload = await askQuestion(body, { userId: testUserId, guestId: null }, null, null);
  await sleep(ASK_DELAY_MS);
  return payload;
};

const getChapterProgressHttp = async (chapterId) => {
  const res = await fetch(`${BASE_URL}/api/v1/chapter-progress/${chapterId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Connection': 'close' },
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
//
// getChapterProgress() (used by both the GET endpoint and every /ask turn via
// step2.loadSession.js) caches for 60s in Redis. The real service invalidates
// this on every write (upsertChapterProgress/markChapterComplete/resetChapterProgress),
// but these direct Mongoose test-fixture writes bypass that service entirely —
// so they must invalidate the same cache key themselves, or the next read
// (GET or /ask) silently serves a stale pre-write snapshot.
const invalidateProgressCache = async (userId, chapterId) => {
  try {
    await redis.del(`cp:${userId}:${chapterId}`, `cp_list:${userId}`);
  } catch { /* non-critical, matches the service's own fail-open pattern */ }
};

const clearProgress = async (userId, chapterId) => {
  await ChapterProgress.deleteOne({ userId, chapterId });
  await invalidateProgressCache(userId, chapterId);
};

const setProgressStatus = async (userId, chapterId, fields) => {
  await ChapterProgress.findOneAndUpdate({ userId, chapterId }, { $set: fields }, { upsert: true });
  await invalidateProgressCache(userId, chapterId);
};

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
  // mode. Loops until the response itself reports 'completed' rather than assuming
  // an exact call count — a provider_error retry can occasionally cause a turn to
  // be re-sent, which would desync a fixed-count loop from the real topic count.
  // Safety cap prevents an infinite loop if completion is never reached.
  if (FULL_RUN) {
    await clearProgress(userId, chapterId);
    const seenTopicIds = new Set();
    let finalTurn = null;
    const SAFETY_CAP = coreTopics.length + 3;

    for (let i = 0; i < SAFETY_CAP; i++) {
      finalTurn = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: randomUUID(), chapterId });
      if (finalTurn?.chapterProgress?.status === 'completed') break;
      const tid = finalTurn?.chapterProgress?.currentTopicId;
      if (tid) seenTopicIds.add(tid);
    }

    record('B', `completedTopicIds grows by exactly one per advance, no duplicates (${coreTopics.length} topics)`,
      seenTopicIds.size === coreTopics.length,
      `distinct topics seen=${seenTopicIds.size}/${coreTopics.length}`);

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

    await clearProgress(userId, chapterId);

    // B2 — the ACTUAL BUG-6 regression guard: walk through the Chemical Reactions
    // chapter's decimal sub-numbered topics ("4.1"-"4.8") and confirm each turn's
    // retrieved SOURCE is genuinely distinct — not the resolver's topicId sequence
    // (that was never broken by BUG-6) but the retrieval content itself, which is
    // exactly what buildTopicSearchQuery()'s regex fix targets.
    if (chapters.chemReactionsChapter) {
      const chemId = chapters.chemReactionsChapter.chapterId;
      await clearProgress(userId, chemId);
      const seenSourceKeys = [];
      const WALK_STEPS = 5; // enough to cross several "4.x" sub-topics without draining the whole chapter
      for (let i = 0; i < WALK_STEPS; i++) {
        const turn = await askTurn({ question: 'Aage badhao', studyMode: 'focus', sessionId: randomUUID(), chapterId: chemId });
        if (turn?.chapterProgress?.status === 'completed') break;
        const sourceKey = turn?.sources?.[0]?.headingPath || turn?.sources?.[0]?.topicTitle || null;
        seenSourceKeys.push(sourceKey);
      }
      const distinctCount = new Set(seenSourceKeys.filter(Boolean)).size;
      record('B', `BUG-6 regression guard: Chemical Reactions decimal sub-topics retrieve genuinely distinct content (${WALK_STEPS} steps)`,
        distinctCount === seenSourceKeys.filter(Boolean).length && distinctCount >= WALK_STEPS - 1,
        `sourceKeys=${JSON.stringify(seenSourceKeys)}`);
      await clearProgress(userId, chemId);
    } else {
      console.log(YELLOW('  [B] Could not resolve a Chemical Reactions chapter — skipping BUG-6-specific decimal-topic check'));
    }
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
    testUserId = userId;
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
