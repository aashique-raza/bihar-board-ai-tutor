import { detectSectionHint, detectSubjectHint } from './subjectAliases.js';
import { TYPO_ALIASES } from './typoAliases.js';

const cleanWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

export const normalizeMessage = (message) => {
  const originalText = cleanWhitespace(message);
  let normalizedText = originalText.toLowerCase();
  const aliasesApplied = [];

  for (const alias of TYPO_ALIASES) {
    if (alias.pattern.test(normalizedText)) {
      normalizedText = normalizedText.replace(alias.pattern, alias.replacement);
      aliasesApplied.push(alias.replacement);
    }

    alias.pattern.lastIndex = 0;
  }

  normalizedText = cleanWhitespace(normalizedText);

  return {
    originalText,
    normalizedText,
    aliasesApplied,
    subjectHint: detectSubjectHint(normalizedText),
    sectionHint: detectSectionHint(normalizedText),
  };
};

