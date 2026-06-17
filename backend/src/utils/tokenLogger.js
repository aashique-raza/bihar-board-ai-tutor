/**
 * tokenLogger.js
 *
 * STEP-0 Instrumentation — Token audit logging for the Ask pipeline.
 * Logs context sizes (pre-LLM) and actual token counts (post-LLM) per turn.
 *
 * approxTokens: 1 token ≈ 4 chars — directionally correct for Hinglish/English.
 * Not exact, but enough to diagnose WHERE tokens are going before/after each fix.
 *
 * Remove or silence this file after all TOKEN_FIX_PLAN steps are done.
 */

import { deciderSystemText } from '../prompts/deciderPrompt.js';
import { tutorSystemText } from '../prompts/tutorPrompt.js';

export const approxTokens = (str) => Math.ceil(String(str ?? '').length / 4);

const pad = (val, n) => String(val ?? 0).padStart(n);

const SYSTEM_PROMPT_TOKENS = {
  DECIDER: approxTokens(deciderSystemText),
  TUTOR: approxTokens(tutorSystemText),
};

export const getSystemPromptTokens = (callName) => SYSTEM_PROMPT_TOKENS[callName] ?? 0;

if (!SYSTEM_PROMPT_TOKENS.DECIDER || !SYSTEM_PROMPT_TOKENS.TUTOR) {
  console.error('[SYSTEM PROMPTS] ERROR: Token count is 0 — check deciderSystemText / tutorSystemText exports');
} else {
  console.log(`[SYSTEM PROMPTS] Decider: ~${SYSTEM_PROMPT_TOKENS.DECIDER} tokens | Tutor: ~${SYSTEM_PROMPT_TOKENS.TUTOR} tokens`);
}

/**
 * Layer 1 — Log approximate sizes of every context component built in step3.
 * Called BEFORE any LLM call so we know what's being sent.
 *
 * @param {string} sessionId
 * @param {number} turnNumber  - 1-based turn index
 * @param {object} components  - { name: stringValue } pairs
 */
export const logContextSizes = (sessionId, turnNumber, components) => {
  const shortId = String(sessionId ?? 'unknown').slice(-8);
  const lines = [
    `\n[CTX AUDIT] Session:...${shortId} | Turn:${turnNumber}`,
    `  ${'Component'.padEnd(24)} ${'Chars'.padStart(7)}   ${'~Tokens'.padStart(8)}`,
    `  ${'-'.repeat(45)}`,
  ];

  let totalTokens = 0;
  for (const [name, value] of Object.entries(components)) {
    const chars = String(value ?? '').length;
    const tokens = approxTokens(value);
    totalTokens += tokens;
    lines.push(`  ${name.padEnd(24)} ${pad(chars, 7)} chars  ${pad(tokens, 7)} tokens`);
  }

  lines.push(`  ${'-'.repeat(45)}`);
  lines.push(`  ${'TOTAL (dynamic parts)'.padEnd(24)} ${' '.repeat(14)} ${pad(totalTokens, 7)} tokens`);
  lines.push(`  (Static system prompts ~2,600 tokens and retrieved context not included above)`);

  console.log(lines.join('\n'));
};

/**
 * Layer 2 — Log actual token counts returned by the LLM provider after a call.
 * Called once each for the Decider (step4) and Tutor (step6).
 *
 * @param {'DECIDER'|'TUTOR'} callName
 * @param {object} breakdown  - { input, output, total }
 * @param {object} meta       - extra key/value pairs to display (intent, responseMode, etc.)
 */
export const logCallTokens = (callName, breakdown, meta = {}) => {
  const { input = 0, output = 0, total = 0, cached = 0 } = breakdown;
  const sysTokens = getSystemPromptTokens(callName);
  const dynInput = Math.max(0, input - sysTokens);
  const metaStr = Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' | ');
  const cachedStr = cached > 0 ? `  |  cached:${pad(cached, 5)}` : '';
  console.log(
    `[${callName.padEnd(7)}] sys:${pad(sysTokens, 5)} + dyn:${pad(dynInput, 5)} + out:${pad(output, 5)} = ${pad(total, 6)} tokens` +
    cachedStr +
    (metaStr ? `  |  ${metaStr}` : '')
  );
};

/**
 * Layer 2b — Per-intent aggregate tracker (in-memory, last 100 turns per intent).
 * recordIntentSample: call once per turn after logTurnSummary.
 * logIntentAggregates: call every N turns to print rolling averages.
 */
const intentStats = new Map();
const MAX_SAMPLES = 100;

export const recordIntentSample = (intent, totalTokens, cachedTokens = 0) => {
  if (!intent || !Number.isFinite(totalTokens)) return;
  const stats = intentStats.get(intent) || { count: 0, totalTokens: 0, totalCached: 0, samples: [] };
  stats.count++;
  stats.totalTokens += totalTokens;
  stats.totalCached += (Number.isFinite(cachedTokens) ? cachedTokens : 0);
  stats.samples.push(totalTokens);
  if (stats.samples.length > MAX_SAMPLES) stats.samples.shift();
  intentStats.set(intent, stats);
};

export const logIntentAggregates = () => {
  console.log('\n[INTENT TOKEN AGGREGATES]');
  for (const [intent, stats] of intentStats.entries()) {
    const avg = Math.round(stats.totalTokens / stats.count);
    const recentAvg = Math.round(stats.samples.reduce((a, b) => a + b, 0) / stats.samples.length);
    const cachedAvg = Math.round(stats.totalCached / stats.count);
    console.log(`  ${intent.padEnd(20)} count:${pad(stats.count, 4)}  alltime_avg:${pad(avg, 5)}  last100_avg:${pad(recentAvg, 5)}  cached_avg:${pad(cachedAvg, 5)}`);
  }
};

/**
 * Layer 3 — Log the full turn summary after step7 saves to DB.
 * Shows per-call breakdown, turn total, and cumulative session health.
 *
 * @param {object} params
 */
export const logTurnSummary = ({
  sessionId,
  turnNumber,
  intent,
  decider,    // { input, output, total }
  tutor,      // { input, output, total }
  sessionTotal,
  sessionLimit,
}) => {
  const shortId = String(sessionId ?? 'unknown').slice(-8);
  const turnTotal = (decider?.total ?? 0) + (tutor?.total ?? 0);
  const pct = sessionLimit > 0 ? Math.round((sessionTotal / sessionLimit) * 100) : 0;
  const flag = sessionTotal >= sessionLimit ? '🔴 OVER LIMIT'
    : pct >= 80 ? '🟡 WARNING'
    : '🟢 OK';

  console.log(
    `\n╔═══════════════════════════════════════════════════════════╗\n` +
    `║  TOKEN AUDIT  Session:...${shortId.padEnd(8)}  Turn: ${turnNumber}  Intent: ${(intent ?? 'UNKNOWN').padEnd(18)}\n` +
    `╠═══════════════════════════════════════════════════════════╣\n` +
    `║  Decider : ${pad(decider?.total, 6)} tokens  (in:${pad(decider?.input, 6)}  out:${pad(decider?.output, 5)})\n` +
    `║  Tutor   : ${pad(tutor?.total, 6)} tokens  (in:${pad(tutor?.input, 6)}  out:${pad(tutor?.output, 5)})\n` +
    `║  TURN    : ${pad(turnTotal, 6)} tokens\n` +
    `╠═══════════════════════════════════════════════════════════╣\n` +
    `║  SESSION : ${pad(sessionTotal, 6)} / ${sessionLimit}  (${pct}%)  ${flag}\n` +
    `╚═══════════════════════════════════════════════════════════╝\n`
  );
};
