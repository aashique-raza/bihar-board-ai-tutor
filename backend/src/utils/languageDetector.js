const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

const HINGLISH_SIGNALS = new Set([
  'aap',
  'batao',
  'btao',
  'hai',
  'hain',
  'hota',
  'hote',
  'hoti',
  'ka',
  'ke',
  'kya',
  'kyu',
  'kyun',
  'kise',
  'ko',
  'mai',
  'me',
  'mein',
  'nahi',
  'samjhao',
]);

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .match(/[a-z]+/g) || [];

export const detectQuestionLanguage = (question) => {
  const text = String(question || '').trim();

  if (DEVANAGARI_PATTERN.test(text)) {
    return {
      detectedLanguage: 'hindi',
      answerLanguage: 'hinglish',
    };
  }

  const tokens = tokenize(text);
  const hasHinglishSignal = tokens.some((token) => HINGLISH_SIGNALS.has(token));

  if (hasHinglishSignal) {
    return {
      detectedLanguage: 'hinglish',
      answerLanguage: 'hinglish',
    };
  }

  if (tokens.length > 0) {
    return {
      detectedLanguage: 'english',
      answerLanguage: 'english',
    };
  }

  return {
    detectedLanguage: 'unknown',
    answerLanguage: 'hinglish',
  };
};

export const getAnswerLanguageInstruction = (answerLanguage) => {
  if (answerLanguage === 'english') {
    return 'Write the final answer in simple English for a Class 10 student.';
  }

  return 'Write the final answer in simple Hinglish for a Class 10 student. Use Roman script only, like "Nutrition ek process hai". Do not use Devanagari/Hindi script.';
};
