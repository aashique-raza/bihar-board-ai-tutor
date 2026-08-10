/**
 * optionShuffler.js
 *
 * Pure functions — no DB, no I/O. Shuffles which original option (by label)
 * lands at each display position. Only labels move; localized text is never
 * touched, so this has no language dependency (Checkpoint 1 rethink).
 */

const DISPLAY_LABELS = ['A', 'B', 'C', 'D'];

export const shuffle = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * @param {object} question - has options[].label and correctOptionLabel (original, DB order)
 * @returns {{ optionOrder: string[], correctOptionLabel: string }}
 *   optionOrder[i] = original label now shown at display position i.
 *   correctOptionLabel = the DISPLAY label ('A'-'D') that is correct after this shuffle.
 */
export const shuffleOptions = (question) => {
  const originalLabels = question.options.map((o) => o.label);
  const optionOrder = shuffle(originalLabels);
  const correctOptionLabel = DISPLAY_LABELS[optionOrder.indexOf(question.correctOptionLabel)];
  return { optionOrder, correctOptionLabel };
};

/**
 * Picks only en/hi/hinglish off a localized-text subdocument. Mongoose gives every
 * nested object (questionText, options[].text) its own _id unless told not to — a
 * lean() read returns that _id verbatim. Passing the subdocument through as-is (as
 * Checkpoint 1 first did) leaked it to the client. This is the actual whitelist step.
 */
export const pickLocalizedText = (localizedText) => ({
  en: localizedText?.en ?? null,
  hi: localizedText?.hi ?? null,
  hinglish: localizedText?.hinglish ?? null,
});

/**
 * Rebuilds the localized options array in the shuffled display order.
 * Used both when serving the initial quiz and when re-rendering results later
 * (Checkpoint 2 submit response reuses this for the same reason).
 */
export const applyOptionOrder = (question, optionOrder) => {
  const byLabel = new Map(question.options.map((o) => [o.label, o]));
  return optionOrder.map((originalLabel, index) => ({
    label: DISPLAY_LABELS[index],
    text: pickLocalizedText(byLabel.get(originalLabel).text),
  }));
};

const hasAnyLanguage = (localizedText) =>
  Boolean(localizedText?.en || localizedText?.hi || localizedText?.hinglish);

/**
 * Defensive check against seed-data drift (dedup/typo issues, not expected in the
 * real 743-question bank, but cheap to guard). A question failing this is skipped
 * during generation rather than crashing the request.
 */
export const isQuestionUsable = (question) => {
  if (!Array.isArray(question.options) || question.options.length !== DISPLAY_LABELS.length) return false;

  const labels = question.options.map((o) => o.label);
  if (new Set(labels).size !== DISPLAY_LABELS.length) return false;
  if (!DISPLAY_LABELS.every((label) => labels.includes(label))) return false;
  if (!labels.includes(question.correctOptionLabel)) return false;
  if (!hasAnyLanguage(question.questionText)) return false;

  return question.options.every((o) => hasAnyLanguage(o.text));
};
