/**
 * test-p2-t2-schema.js
 * Tests for P2-T2: sessionType, totalTokensUsed, messageCount fields
 * + updateChatSession() unified function
 *
 * Run: node scripts/test-p2-t2-schema.js (from backend/)
 * Cleans up all test documents after itself.
 */

import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import {
  updateChatSession,
  findChatSession,
  getOrCreateChatSession,
} from '../src/services/chatSession.service.js';
import { randomUUID } from 'node:crypto';

// ─── helpers ───────────────────────────────────────────────────────────────

const pass = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => { if (!cond) fail(msg); };

const section = (title) => console.log(`\n── ${title} ──`);

const cleanupIds = [];
const track = (id) => { cleanupIds.push(id); return id; };

// ─── tests ─────────────────────────────────────────────────────────────────

async function testSchemaDefaults() {
  section('1. Schema defaults — new fields exist with correct defaults');

  const sessionId = track(randomUUID());

  await updateChatSession(
    sessionId,
    { chatStateSet: { answerLanguage: 'hinglish' } },
    { userId: null, sessionType: 'global' }
  );

  const doc = await findChatSession(sessionId);
  assert(doc, 'Document should be created');
  assert(doc.sessionType === 'global', `sessionType default wrong: ${doc.sessionType}`);
  assert(doc.totalTokensUsed === 0, `totalTokensUsed default wrong: ${doc.totalTokensUsed}`);
  assert(doc.chatState.messageCount === 0, `messageCount wrong before $inc: ${doc.chatState.messageCount}`);
  pass('sessionType defaults to "global"');
  pass('totalTokensUsed defaults to 0');
  pass('chatState.messageCount defaults to 0');
}

async function testMessageCountIncrement() {
  section('2. messageCount — atomic $inc per turn');

  const sessionId = track(randomUUID());

  // Turn 1
  const after1 = await updateChatSession(
    sessionId,
    { chatStateSet: { answerLanguage: 'hinglish' }, chatStateInc: { messageCount: 1 } },
    { userId: null, sessionType: 'global' }
  );
  assert(after1.chatState.messageCount === 1, `After turn 1: expected 1, got ${after1.chatState.messageCount}`);
  pass('messageCount === 1 after first turn');

  // Turn 2
  const after2 = await updateChatSession(
    sessionId,
    { chatStateSet: {}, chatStateInc: { messageCount: 1 } },
    { userId: null, sessionType: 'global' }
  );
  assert(after2.chatState.messageCount === 2, `After turn 2: expected 2, got ${after2.chatState.messageCount}`);
  pass('messageCount === 2 after second turn');

  // First-turn detection (P2-T3 will use this)
  const isFirstTurn = after1.chatState.messageCount === 1;
  assert(isFirstTurn, 'First turn detection failed');
  pass('First turn correctly detected via returned messageCount === 1');
}

async function testSessionTypeImmutability() {
  section('3. sessionType — immutable after first write ($setOnInsert)');

  const sessionId = track(randomUUID());
  const userId = 'user_test_' + randomUUID().slice(0, 8);

  // Create as focus session
  await updateChatSession(
    sessionId,
    { chatStateSet: { learningMode: 'lesson' }, chatStateInc: { messageCount: 1 } },
    { userId, sessionType: 'focus' }
  );

  const after1 = await findChatSession(sessionId);
  assert(after1.sessionType === 'focus', `Should be focus, got: ${after1.sessionType}`);
  pass('sessionType set to "focus" on creation');

  // Try to "overwrite" with global on second turn — must NOT change
  await updateChatSession(
    sessionId,
    { chatStateSet: { learningMode: 'idle' }, chatStateInc: { messageCount: 1 } },
    { userId, sessionType: 'global' } // attacker tries to flip to global
  );

  const after2 = await findChatSession(sessionId);
  assert(after2.sessionType === 'focus', `sessionType must stay "focus", got: ${after2.sessionType}`);
  pass('sessionType stays "focus" even when "global" passed on 2nd turn — $setOnInsert is immutable');
}

async function testTotalTokensUsed() {
  section('4. totalTokensUsed — top-level $inc accumulates correctly');

  const sessionId = track(randomUUID());

  // Simulate P2-T4 wiring: token delta per turn
  const turn1Tokens = 420;
  await updateChatSession(
    sessionId,
    { chatStateInc: { messageCount: 1 }, topLevelInc: { totalTokensUsed: turn1Tokens } },
    { userId: null, sessionType: 'global' }
  );

  const after1 = await findChatSession(sessionId);
  assert(after1.totalTokensUsed === turn1Tokens, `Expected ${turn1Tokens}, got ${after1.totalTokensUsed}`);
  pass(`totalTokensUsed accumulates: ${turn1Tokens} after turn 1`);

  const turn2Tokens = 380;
  await updateChatSession(
    sessionId,
    { chatStateInc: { messageCount: 1 }, topLevelInc: { totalTokensUsed: turn2Tokens } },
    { userId: null, sessionType: 'global' }
  );

  const after2 = await findChatSession(sessionId);
  const expected = turn1Tokens + turn2Tokens;
  assert(after2.totalTokensUsed === expected, `Expected ${expected}, got ${after2.totalTokensUsed}`);
  pass(`totalTokensUsed accumulates: ${expected} after turn 2 (${turn1Tokens} + ${turn2Tokens})`);
}

async function testGetOrCreateWithSessionType() {
  section('5. getOrCreateChatSession — sessionType + userId via $setOnInsert');

  const sessionId = track(randomUUID());
  const userId = 'user_test_' + randomUUID().slice(0, 8);

  const created = await getOrCreateChatSession(sessionId, { sessionType: 'focus', userId });
  assert(created.sessionType === 'focus', `Expected focus, got: ${created.sessionType}`);
  assert(created.userId === userId, `userId not set: ${created.userId}`);
  assert(created.mode === 'logged_in', `mode wrong: ${created.mode}`);
  pass('getOrCreateChatSession sets sessionType, userId, mode on creation');

  // Second call must not overwrite
  await getOrCreateChatSession(sessionId, { sessionType: 'global', userId: 'different_user' });
  const after = await findChatSession(sessionId);
  assert(after.sessionType === 'focus', `sessionType should stay focus, got: ${after.sessionType}`);
  assert(after.userId === userId, `userId should stay original, got: ${after.userId}`);
  pass('getOrCreateChatSession does not overwrite existing sessionType or userId');
}

async function testIsLockedDerivedFromChatState() {
  section('6. isLocked — derived from chatState.status, not a separate field');

  const sessionId = track(randomUUID());

  await updateChatSession(
    sessionId,
    { chatStateSet: { status: 'active' } },
    { userId: null, sessionType: 'global' }
  );

  const active = await findChatSession(sessionId);
  const isLockedWhenActive = active.chatState.status === 'exhausted';
  assert(!isLockedWhenActive, 'isLocked should be false when status=active');
  pass('isLocked = false when chatState.status = "active"');

  await updateChatSession(
    sessionId,
    { chatStateSet: { status: 'exhausted' } },
    { userId: null, sessionType: 'global' }
  );

  const exhausted = await findChatSession(sessionId);
  const isLockedWhenExhausted = exhausted.chatState.status === 'exhausted';
  assert(isLockedWhenExhausted, 'isLocked should be true when status=exhausted');
  assert(!('isLocked' in exhausted.toObject()), 'No separate isLocked field should exist in DB document');
  pass('isLocked = true when chatState.status = "exhausted"');
  pass('No redundant isLocked field stored in DB — single source of truth');
}

async function testCompoundIndex() {
  section('7. Compound index (userId, lastMessageAt) — exists in schema');

  const indexes = ChatSession.schema.indexes();
  const hasCompound = indexes.some(([fields]) =>
    fields.userId === 1 && fields.lastMessageAt === -1
  );
  assert(hasCompound, 'Compound index { userId: 1, lastMessageAt: -1 } not found in schema');
  pass('Compound index { userId: 1, lastMessageAt: -1 } exists — sessions list query will be O(log n)');
}

// ─── runner ────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════');
console.log('  P2-T2 Schema Test Suite');
console.log('═══════════════════════════════════════════');

try {
  await connectDB();

  await testSchemaDefaults();
  await testMessageCountIncrement();
  await testSessionTypeImmutability();
  await testTotalTokensUsed();
  await testGetOrCreateWithSessionType();
  await testIsLockedDerivedFromChatState();
  await testCompoundIndex();

  console.log('\n═══════════════════════════════════════════');
  console.log('  ALL TESTS PASSED ✅');
  console.log('═══════════════════════════════════════════\n');
} catch (err) {
  console.error(`\n  FAILED ❌  ${err.message}\n`);
  process.exitCode = 1;
} finally {
  // Cleanup all test documents
  if (cleanupIds.length) {
    await ChatSession.deleteMany({ sessionId: { $in: cleanupIds } });
    console.log(`Cleaned up ${cleanupIds.length} test document(s).`);
  }
  await disconnectDB();
}
