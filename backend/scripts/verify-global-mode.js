/**
 * verify-global-mode.js
 *
 * Automated regression net for Global Mode — the symmetric counterpart to
 * verify-focus-mode.js. Calls askQuestion() directly (same in-process
 * pattern as verify-focus-mode.js / verify-session-mode-guard.js), no HTTP/
 * auth needed since Global Mode never touches the ChapterProgress endpoint.
 *
 * Cross-mode SWITCHING (focus <-> global on the same sessionId, the A2/E1
 * bug) is already covered by verify-session-mode-guard.js — deliberately
 * NOT duplicated here. This script covers what's unique to staying in
 * Global Mode (GLOBAL_MODE_VERIFICATION_CHECKLIST.md):
 *
 *   Section A — B1/B2 fix: NEXT_STEP with no chapter selected
 *   Section B — C1: retrieval has no chapter filter, reaches all subjects
 *   Section C — chip guarantees never leak Focus-only chips into Global
 *   Section D — baseline: mode-independent intents still work in Global
 *
 * Server does NOT need to be running — askQuestion() is called in-process.
 *
 * Usage: node scripts/verify-global-mode.js
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { askQuestion } from '../src/ask/askOrchestrator.js';
import { loadCurriculumIndex } from '../src/curriculum/curriculumIndexLoader.js';
import { getChapterCoreTopics } from '../src/curriculum/topicResolver.js';

// ── ANSI colour helpers (same pattern as the other verify-*.js scripts) ──────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same Groq TPM-cap reasoning as verify-focus-mode.js's askTurn().
const ASK_DELAY_MS = 8000;
const RETRY_BACKOFF_MS = 15000;

const results = [];
const record = (section, name, pass, detail = '') => {
  results.push({ section, name, pass, detail });
  const tag = pass ? GREEN('PASS') : RED('FAIL');
  console.log(`  [${section}] ${tag} — ${name}${detail ? `  (${detail})` : ''}`);
};

// askQuestion() itself does not retry on provider errors — it just returns
// an error-shaped payload (no session.sessionId on that turn). Retry here,
// same as verify-session-mode-guard.js's askWithRetry().
const askTurn = async (body, ctx, attempt = 1) => {
  const result = await askQuestion(body, ctx);
  await sleep(ASK_DELAY_MS);
  if (!result?.session?.sessionId && attempt <= 2) {
    console.log(YELLOW(`    (provider_error, retry ${attempt}/2 after ${RETRY_BACKOFF_MS / 1000}s: "${body.question.slice(0, 40)}")`));
    await sleep(RETRY_BACKOFF_MS);
    return askTurn(body, ctx, attempt + 1);
  }
  return result;
};

// ── Chapter resolution (dynamic — never hardcode an assumed chapterId/title) ─
const resolveChapters = async () => {
  const index = await loadCurriculumIndex();
  let lightChapter = null;
  let bioChapter = null;

  for (const subject of index.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        const title = chapter.title.toLowerCase();
        if (!lightChapter && title.includes('light') && title.includes('reflection')) {
          lightChapter = chapter;
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
  return { lightChapter, bioChapter, bioTopic: bioTopics[0] };
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A — B1/B2 fix: NEXT_STEP with no chapter selected (Global Mode)
// ═══════════════════════════════════════════════════════════════════════════
const runSectionA = async (guestId, chapters) => {
  console.log(BOLD('\n── SECTION A: NEXT_STEP with no chapter selected (B1/B2 fix) ──'));

  const globalSession = randomUUID();
  const turn = await askTurn(
    { question: 'Aage badho', studyMode: 'global', sessionId: globalSession },
    { userId: null, guestId }
  );

  record('A', 'Global-mode NEXT_STEP with no chapter returns the deterministic guidance message',
    turn?.status === 'answered' &&
    /chapter select nahi hai/i.test(turn?.sections?.[0]?.content || ''),
    `status=${turn?.status} content=${JSON.stringify(turn?.sections?.[0]?.content)}`);

  const chipTypes = (turn?.suggestedActions || []).map((a) => a.type).sort();
  record('A', 'Chip set is exactly [global_mode, switch_chapter] — no next_topic (nothing to advance to)',
    JSON.stringify(chipTypes) === JSON.stringify(['global_mode', 'switch_chapter']),
    `chips=${JSON.stringify(turn?.suggestedActions)}`);

  const sessionDoc = await ChatSession.findOne({ sessionId: turn?.session?.sessionId }).lean();
  record('A', 'DB session stays sessionType=global with no chapter fields leaked in',
    sessionDoc?.sessionType === 'global' && !sessionDoc?.chatState?.currentChapterId,
    `sessionType=${sessionDoc?.sessionType} currentChapterId=${sessionDoc?.chatState?.currentChapterId}`);

  // Boundary check: the SAME "aage badho" phrasing in Focus Mode (real chapter
  // active) must NOT hit this fixed message — proves the new intentRouter.js
  // block is scoped tightly to (NO_RETRIEVED_CONTEXT && NEXT_STEP), not to
  // the phrase itself.
  const focusSession = randomUUID();
  const focusTurn = await askTurn(
    { question: 'Aage badho', studyMode: 'focus', sessionId: focusSession, chapterId: chapters.lightChapter.chapterId },
    { userId: null, guestId }
  );
  record('A', 'Same phrasing in Focus Mode (real chapter) still teaches a real topic, not the fixed guidance message',
    focusTurn?.status === 'answered' &&
    !/chapter select nahi hai/i.test(focusTurn?.sections?.[0]?.content || '') &&
    focusTurn?.sources?.length > 0,
    `status=${focusTurn?.status} sources=${focusTurn?.sources?.length}`);

  await ChatSession.deleteMany({ sessionId: { $in: [globalSession, focusSession] } });
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION B + C — Global retrieval reaches all subjects (C1), and no
// Focus-only chip leaks into Global responses (sanitizeSuggestedActions
// guarantee is gated on studyMode === 'focus')
// ═══════════════════════════════════════════════════════════════════════════
const runSectionsBC = async (guestId, chapters) => {
  console.log(BOLD('\n── SECTION B+C: Global retrieval scope + chip guarantees ──'));
  const session = randomUUID();

  // B1 + C1: Physics question, no chapter filter active
  const physicsTurn = await askTurn(
    { question: 'Light ka reflection kya hota hai?', studyMode: 'global', sessionId: session },
    { userId: null, guestId }
  );
  record('B', 'Global CONCEPT_QUESTION (Physics topic) answers from the correct chapter',
    physicsTurn?.status === 'answered' &&
    physicsTurn?.sources?.some((s) => s.chapterTitle === chapters.lightChapter.title),
    `status=${physicsTurn?.status} chapters=${JSON.stringify(physicsTurn?.sources?.map((s) => s.chapterTitle))}`);

  record('C', 'Global CONCEPT_QUESTION never gets an auto-injected next_topic chip (guarantee is Focus-only)',
    !(physicsTurn?.suggestedActions || []).some((a) => a.type === 'next_topic'),
    `chips=${JSON.stringify(physicsTurn?.suggestedActions)}`);

  // B2: Biology question, SAME session — proves no chapter filter stuck from
  // the previous turn (Global Mode has no metadataFilter at all, see C1).
  const bioTurn = await askTurn(
    { question: `${chapters.bioTopic.title} kya hota hai, samjhao`, studyMode: 'global', sessionId: session },
    { userId: null, guestId }
  );
  record('B', 'Global CONCEPT_QUESTION (Biology topic, same session) answers from a DIFFERENT chapter — no sticky filter',
    bioTurn?.status === 'answered' &&
    bioTurn?.sources?.some((s) => s.chapterTitle === chapters.bioChapter.title),
    `status=${bioTurn?.status} chapters=${JSON.stringify(bioTurn?.sources?.map((s) => s.chapterTitle))}`);

  // C2: EXPLAIN_MORE right after, same session — lastRetrievalQuery now holds
  // the Biology question, so this should re-explain it, not error out.
  const explainTurn = await askTurn(
    { question: 'Samajh nahi aaya', studyMode: 'global', sessionId: session },
    { userId: null, guestId }
  );
  record('C', 'Global EXPLAIN_MORE never gets an auto-injected next_topic chip either',
    !(explainTurn?.suggestedActions || []).some((a) => a.type === 'next_topic'),
    `status=${explainTurn?.status} chips=${JSON.stringify(explainTurn?.suggestedActions)}`);

  await ChatSession.deleteMany({ sessionId: session });
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION D — Baseline: mode-independent intents still work in Global Mode
// ═══════════════════════════════════════════════════════════════════════════
const runSectionD = async (guestId) => {
  console.log(BOLD('\n── SECTION D: Baseline mode-independent intents ──'));
  const session = randomUUID();

  const chooseCourse = await askTurn(
    { question: 'Chemistry padhna hai', studyMode: 'global', sessionId: session },
    { userId: null, guestId }
  );
  record('D', 'CHOOSE_COURSE works normally in Global Mode',
    chooseCourse?.status !== 'error' && (chooseCourse?.sections?.length > 0),
    `status=${chooseCourse?.status} sections=${chooseCourse?.sections?.length}`);

  const examInfo = await askTurn(
    { question: 'Science ke kitne marks hote hain exam mein?', studyMode: 'global', sessionId: session },
    { userId: null, guestId }
  );
  record('D', 'EXAM_INFO works normally in Global Mode',
    examInfo?.status === 'answered' && examInfo?.sections?.length > 0,
    `status=${examInfo?.status} sections=${examInfo?.sections?.length}`);

  await ChatSession.deleteMany({ sessionId: session });
};

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
const main = async () => {
  console.log(BOLD('\n══════════════════════════════════════════════════════'));
  console.log(BOLD('  GLOBAL MODE VERIFICATION SCRIPT'));
  console.log(BOLD('══════════════════════════════════════════════════════'));

  await connectDB();

  try {
    const chapters = await resolveChapters();
    console.log(GREEN(`  ✓ Resolved chapters: Light="${chapters.lightChapter.title}", Biology="${chapters.bioChapter.title}"`));

    const guestId = `global-mode-verify-${randomUUID()}`;

    await runSectionA(guestId, chapters);
    await runSectionsBC(guestId, chapters);
    await runSectionD(guestId);

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
    console.error(RED('\n[verify-global-mode] Unexpected error:'), err);
    await disconnectDB();
    process.exit(1);
  }
};

main();
