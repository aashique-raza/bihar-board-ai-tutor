export const SUBJECT_ALIASES = {
  science: ['science', 'vigyan'],
  math: ['math', 'maths', 'mathematics', 'ganit'],
  hindi: ['hindi'],
  english: ['english', 'grammar'],
  social_science: ['social science', 'social', 'sst', 'history', 'geography', 'civics', 'economics'],
  urdu: ['urdu'],
  sanskrit: ['sanskrit'],
};

export const SECTION_ALIASES = {
  physics: ['physics', 'physic', 'phy'],
  chemistry: ['chemistry', 'chem'],
  biology: ['biology', 'bio'],
  grammar: ['grammar', 'vyakaran'],
  literature: ['literature'],
  history: ['history', 'itihas'],
  geography: ['geography', 'bhugol'],
  civics: ['civics'],
  economics: ['economics'],
};

export const SUBJECT_SECTIONS = {
  science: ['physics', 'chemistry', 'biology'],
  english: ['grammar', 'literature'],
  hindi: ['grammar', 'literature'],
  social_science: ['history', 'geography', 'civics', 'economics'],
};

const normalizeAlias = (value) => String(value || '').trim().toLowerCase();

const findAliasKey = (aliasesByKey, text) => {
  const normalizedText = normalizeAlias(text);

  for (const [key, aliases] of Object.entries(aliasesByKey)) {
    if (aliases.some((alias) => normalizedText.includes(normalizeAlias(alias)))) {
      return key;
    }
  }

  return null;
};

export const detectSubjectHint = (text) => {
  const directSubject = findAliasKey(SUBJECT_ALIASES, text);

  if (directSubject) {
    return directSubject;
  }

  const section = findAliasKey(SECTION_ALIASES, text);

  if (!section) {
    return null;
  }

  return Object.entries(SUBJECT_SECTIONS).find(([, sections]) =>
    sections.includes(section)
  )?.[0] || null;
};

export const detectSectionHint = (text) => findAliasKey(SECTION_ALIASES, text);

