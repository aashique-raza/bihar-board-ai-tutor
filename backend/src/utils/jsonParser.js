/**
 * jsonParser.js
 *
 * Utility functions for safely parsing JSON from LLM responses.
 *
 * Designed to handle all three supported providers:
 *   - Groq   : returns clean JSON (no issues)
 *   - OpenAI : usually clean, occasionally wraps in markdown
 *   - Gemini : often wraps in ```json...``` and/or adds preamble text
 *
 * Usage:
 *   import { parseJsonObject, stringifyForPrompt } from '../utils/jsonParser.js';
 */

// Strips ALL markdown code fences anywhere in the text — not just start/end.
// Handles: ```json, ```JSON, ``` (plain), with or without newlines after.
const stripCodeFences = (text) =>
  String(text || '')
    .replace(/```(?:json|JSON)?\s*\n?/g, '')
    .replace(/\n?```/g, '')
    .trim();

/**
 * Finds the closing `}` that balances the opening `{` at position `start`.
 * String-aware: does not count braces inside quoted string values.
 * More accurate than lastIndexOf('}') when extra text follows the JSON.
 *
 * @param {string} text
 * @param {number} start - index of the opening `{`
 * @returns {number}     - index of the matching `}`, or -1 if not found
 */
const findJsonEnd = (text, start) => {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape)            { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"')        { inString = !inString; continue; }
    if (inString)          continue;
    if (ch === '{')        depth++;
    else if (ch === '}')   { depth--; if (depth === 0) return i; }
  }
  return -1;
};

/**
 * Parses a JSON object from raw LLM text output.
 * Works across Groq, OpenAI, and Gemini regardless of response format.
 *
 * @param {string} rawText - Raw string from LLM
 * @param {string} label   - Human-readable label for error messages
 * @returns {object}       - Parsed JavaScript object
 * @throws {Error}         - If no valid JSON object is found
 */
export const parseJsonObject = (rawText, label = 'LLM response') => {
  const text = stripCodeFences(rawText);
  const firstBrace = text.indexOf('{');

  if (firstBrace === -1) {
    console.error(`[JSON Parse Fail — ${label}] No opening brace found. Raw output: "${String(rawText).slice(0, 300)}"`);
    throw new Error(`${label} did not contain a JSON object.`);
  }

  const lastBrace = findJsonEnd(text, firstBrace);

  if (lastBrace === -1) {
    console.error(`[JSON Parse Fail — ${label}] Unbalanced braces. Raw output: "${String(rawText).slice(0, 300)}"`);
    throw new Error(`${label} did not contain a valid JSON object.`);
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    console.error(`[JSON Parse Fail — ${label}] JSON.parse failed. Extracted: "${text.slice(firstBrace, lastBrace + 1).slice(0, 300)}"`);
    throw new Error(`${label} JSON could not be parsed: ${error.message}`);
  }
};

/**
 * Converts a value to a formatted JSON string for use inside LLM prompts.
 * Converts null/undefined to the string "null".
 *
 * @param {*} value - Any value to stringify
 * @returns {string} - Pretty-printed JSON string
 */
export const stringifyForPrompt = (value) =>
  JSON.stringify(value || null, null, 2);
