const stripCodeFence = (text) =>
  String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

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

export const stringifyForPrompt = (value) =>
  JSON.stringify(value || null, null, 2);
