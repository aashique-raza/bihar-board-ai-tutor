/**
 * quizResponse.js
 *
 * Whitelist-based response shaping for quiz APIs. Builds the client-facing
 * question shape field-by-field instead of stripping fields from the DB doc —
 * a new field added to the Question model later can never leak (correctOptionLabel,
 * explanation, topicId) just by forgetting to blacklist it here.
 */

import { applyOptionOrder, pickLocalizedText } from '../services/quiz/optionShuffler.js';

export const toClientQuestion = (question, optionOrder) => ({
  questionId: String(question._id),
  text: pickLocalizedText(question.questionText),
  options: applyOptionOrder(question, optionOrder),
  askedInYears: question.askedInYears,
  
});
