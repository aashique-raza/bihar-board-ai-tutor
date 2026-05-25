/**
 * jsonParser.js
 *
 * Utility functions for safely parsing JSON from LLM responses.
 *
 * LLMs sometimes wrap JSON in markdown code fences like ```json ... ```
 * or add extra text before/after. These helpers clean that up.
 *
 * Usage:
 *   import { parseJsonObject, stringifyForPrompt } from '../utils/jsonParser.js';
 */

// Removes markdown code fences (```json ... ```) from LLM output
const stripCodeFence = (text) =>
  String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

/**
 * Parses a JSON object from raw LLM text output.
 * Extracts the first { ... } block found and parses it safely.
 *
 * @param {string} rawText - Raw string from LLM
 * @param {string} label   - Human-readable label for error messages
 * @returns {object}       - Parsed JavaScript object
 * @throws {Error}         - If no valid JSON object is found
 */
export const parseJsonObject = (rawText, label = 'LLM response') => {
  const text = stripCodeFence(rawText);
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`${label} did not contain a JSON object.`);
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch (error) {
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
