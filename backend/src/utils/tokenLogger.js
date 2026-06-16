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

export const approxTokens = (str) => Math.ceil(String(str ?? '').length / 4);

const pad = (val, n) => String(val ?? 0).padStart(n);

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
  const { input = 0, output = 0, total = 0 } = breakdown;
  const metaStr = Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' | ');
  console.log(
    `[${callName.padEnd(7)}] in:${pad(input, 6)} + out:${pad(output, 5)} = ${pad(total, 6)} tokens` +
    (metaStr ? `  |  ${metaStr}` : '')
  );
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
    `║  TOKEN AUDIT  Session:...${shortId.padEnd(8)}  Turn: ${turnNumber}\n` +
    `╠═══════════════════════════════════════════════════════════╣\n` +
    `║  Decider : ${pad(decider?.total, 6)} tokens  (in:${pad(decider?.input, 6)}  out:${pad(decider?.output, 5)})\n` +
    `║  Tutor   : ${pad(tutor?.total, 6)} tokens  (in:${pad(tutor?.input, 6)}  out:${pad(tutor?.output, 5)})\n` +
    `║  TURN    : ${pad(turnTotal, 6)} tokens\n` +
    `╠═══════════════════════════════════════════════════════════╣\n` +
    `║  SESSION : ${pad(sessionTotal, 6)} / ${sessionLimit}  (${pct}%)  ${flag}\n` +
    `╚═══════════════════════════════════════════════════════════╝\n`
  );
};
