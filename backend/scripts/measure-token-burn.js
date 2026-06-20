/**
 * measure-token-burn.js
 *
 * Phase 5 Decision Gate — Step 5.1.1
 *
 * Worst-case token burn measurement:
 *   - All queries are CONCEPT_QUESTION or EXPLAIN_MORE (RAG-heavy, history-building)
 *   - These are the most expensive intents in the pipeline
 *   - If we get 6-7 turns in 15k → 30k gives ~12-14 turns → Phase 5 decision
 *
 * Run: node backend/scripts/measure-token-burn.js
 * Server must be running at localhost:5001
 */

const API_BASE = 'http://localhost:5001';
const SESSION_LIMIT = 15000;

// Worst-case query sequence:
// - All academic queries (CONCEPT_QUESTION + EXPLAIN_MORE)
// - Mix of topics so RAG retrieves different chunks each time (realistic)
// - EXPLAIN_MORE placed after a CONCEPT turn (forces full history read + variation)
const WORST_CASE_QUERIES = [
  { label: 'T1 CONCEPT', question: 'Photosynthesis kya hoti hai? Step by step explain karo.' },
  { label: 'T2 CONCEPT', question: 'Prakaash ka pravartan (refraction of light) kya hota hai? Example ke saath batao.' },
  { label: 'T3 EXPLAIN_MORE', question: 'Nahi samjha. Pravartan ko dusre tarike se samjhao, aur simple example do.' },
  { label: 'T4 CONCEPT', question: 'Acid aur base mein kya difference hota hai? Chemistry mein kaise pahchante hain?' },
  { label: 'T5 CONCEPT', question: 'DNA kya hota hai aur ye heredity mein kya role play karta hai?' },
  { label: 'T6 EXPLAIN_MORE', question: 'DNA wali cheez dobara samjhao — aur bhi simple tarike se.' },
  { label: 'T7 CONCEPT', question: 'Electric circuit mein resistance kya hota hai? Ohm ka law bhi batao.' },
  { label: 'T8 CONCEPT', question: 'Magnetic field kaise banta hai aur current carrying wire ke paas kya hota hai?' },
  { label: 'T9 EXPLAIN_MORE', question: 'Magnetic field wali concept thodi aur detail mein chahiye, diagram describe karke.' },
  { label: 'T10 CONCEPT', question: 'Mitosis aur Meiosis mein kya fark hai? Dono ka purpose kya hai?' },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const pad = (str, n) => String(str).padEnd(n);
const padL = (str, n) => String(str).padStart(n);

// ─── single API call ──────────────────────────────────────────────────────────
async function askQuestion(question, sessionId) {
  const body = { question, studyMode: 'global' };
  if (sessionId) body.sessionId = sessionId;

  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/v1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - t0;
  const json = await res.json();
  const data = json.data ?? json;   // unwrap { success, message, data } envelope
  return { httpStatus: res.status, elapsed, data };
}

// ─── main measurement loop ────────────────────────────────────────────────────
async function runMeasurement() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  ZUNO — PHASE 5 DECISION GATE — TOKEN BURN MEASUREMENT');
  console.log('  Worst-case: all CONCEPT + EXPLAIN_MORE turns (RAG active)');
  console.log(`  Session limit: ${SESSION_LIMIT} tokens`);
  console.log('════════════════════════════════════════════════════════════════\n');

  let sessionId = null;
  let prevTotal = 0;
  const results = [];

  for (let i = 0; i < WORST_CASE_QUERIES.length; i++) {
    const { label, question } = WORST_CASE_QUERIES[i];

    console.log(`\n──── ${label} ────────────────────────────────────────────────`);
    console.log(`  Query: "${question.slice(0, 70)}${question.length > 70 ? '…' : ''}"`);

    let data, elapsed, httpStatus;
    try {
      ({ data, elapsed, httpStatus } = await askQuestion(question, sessionId));
    } catch (err) {
      console.error(`  ❌ Network error: ${err.message}`);
      break;
    }

    if (httpStatus !== 200) {
      console.error(`  ❌ HTTP ${httpStatus}:`, JSON.stringify(data).slice(0, 200));
      break;
    }

    // Extract session info from response
    const session = data?.session;
    const intent = data?.decision?.intent ?? data?.responseMode ?? '?';
    const totalNow = session?.totalTokensUsed ?? 0;
    const turnNum = session?.messageCount ?? (i + 1);
    const isLocked = session?.isLocked ?? false;
    const turnCost = totalNow - prevTotal;
    const remaining = SESSION_LIMIT - totalNow;

    // Capture sessionId from first response
    if (!sessionId && session?.sessionId) {
      sessionId = session.sessionId;
      console.log(`  Session created: ${sessionId}`);
    }

    results.push({
      turn: turnNum,
      label,
      intent,
      turnCost,
      totalNow,
      remaining,
      elapsed,
      locked: isLocked,
    });

    console.log(`  Intent:    ${intent}`);
    console.log(`  This turn: ${turnCost} tokens`);
    console.log(`  Cumulative:${totalNow} / ${SESSION_LIMIT}  (${remaining} remaining)`);
    console.log(`  Time:      ${elapsed}ms`);

    if (isLocked || totalNow >= SESSION_LIMIT) {
      console.log('\n  ⚠️  SESSION LOCKED — token limit reached');
      break;
    }

    prevTotal = totalNow;

    // Small delay between turns to avoid Groq rate-limit on free tier
    if (i < WORST_CASE_QUERIES.length - 1) {
      console.log('  ⏳ Waiting 3s (Groq rate-limit buffer)...');
      await delay(3000);
    }
  }

  // ─── Summary table ─────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(
    pad('Turn', 6) +
    pad('Label', 22) +
    pad('Intent', 22) +
    padL('Cost', 7) +
    padL('Total', 8) +
    padL('Remaining', 11) +
    padL('ms', 7)
  );
  console.log('─'.repeat(83));

  for (const r of results) {
    const locked = r.locked ? ' 🔒' : '';
    console.log(
      pad(r.turn, 6) +
      pad(r.label, 22) +
      pad(r.intent, 22) +
      padL(r.turnCost, 7) +
      padL(r.totalNow, 8) +
      padL(r.remaining, 11) +
      padL(r.elapsed, 7) +
      locked
    );
  }

  console.log('─'.repeat(83));

  // ─── Analysis ──────────────────────────────────────────────────────────────
  const completedTurns = results.filter(r => !r.locked).length;
  const costs = results.map(r => r.turnCost).filter(c => c > 0);
  const avgCost = costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;
  const minCost = costs.length ? Math.min(...costs) : 0;
  const lastLockedTurn = results.find(r => r.locked);

  console.log('\n  📊 ANALYSIS:');
  console.log(`  Turns completed before lock:  ${completedTurns}`);
  console.log(`  Avg tokens/turn:              ${avgCost}`);
  console.log(`  Min tokens/turn:              ${minCost}  (cheapest turn)`);
  console.log(`  Max tokens/turn:              ${maxCost}  (most expensive turn)`);
  console.log(`  Turns at 15k window:          ${completedTurns} (observed)`);
  console.log(`  Projected turns at 30k:       ~${Math.floor(30000 / avgCost)} (extrapolated from avg)`);

  // Phase 5 decision
  const projected30k = avgCost > 0 ? Math.floor(30000 / avgCost) : 0;
  console.log('\n  🔍 PHASE 5 DECISION GATE:');
  if (projected30k >= 12) {
    console.log(`  ✅ SKIP Phase 5 — projected ${projected30k} turns at 30k >= target 12.`);
    console.log('     Phase 2+3 savings are sufficient. History compression not needed.');
  } else if (projected30k >= 9) {
    console.log(`  ⚠️  BORDERLINE — projected ${projected30k} turns at 30k. Phase 5 recommended.`);
    console.log('     History compression would add 3-4 more turns. Worth implementing.');
  } else {
    console.log(`  ❌ PROCEED with Phase 5 — projected ${projected30k} turns at 30k < target 12.`);
    console.log('     History compression is needed. May also need to investigate other bloat.');
  }

  console.log('\n════════════════════════════════════════════════════════════════\n');
}

runMeasurement().catch((err) => {
  console.error('\n❌ Measurement script crashed:', err.message);
  process.exit(1);
});
