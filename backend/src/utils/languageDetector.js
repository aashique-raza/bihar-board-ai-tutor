const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

const HINGLISH_SIGNALS = new Set([
  'aap', 'ab', 'accha', 'batao', 'bat', 'btao', 'bta', 'fir', 'hai', 'hain',
  'ho', 'hota', 'hote', 'hoti', 'hu', 'hun', 'ka', 'kaha', 'ke', 'kr', 'kro',
  'kya', 'kyu', 'kyun', 'kise', 'ko', 'mai', 'me', 'mein', 'mujhe', 'nahi',
  'nhi', 'rahe', 'rhe', 'rhta', 'rhte', 'samjhao', 'tum', 'yad',
]);

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .match(/[a-z]+/g) || [];

/**
 * Detects the language of a single question and picks the language to answer in.
 */
export const detectQuestionLanguage = (question) => {
  const text = String(question || '').trim();

  // If the question contains Devanagari characters, answer in Hindi too
  if (DEVANAGARI_PATTERN.test(text)) {
    return {
      detectedLanguage: 'hindi',
      answerLanguage: 'hindi',
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
    // Answer English questions in Hinglish too: Bihar Board students understand
    // Hinglish, and the vector store content is indexed in Hinglish.
    return {
      detectedLanguage: 'english',
      answerLanguage: 'hinglish',
    };
  }

  return {
    detectedLanguage: 'unknown',
    answerLanguage: 'hinglish',
  };
};

/**
 * Picks the answer language using the current question plus recent chat history.
 */
export const detectConversationLanguage = ({ question, recentMessages = [] }) => {
  const latestLanguage = detectQuestionLanguage(question);

  // If the current message is already Hindi or Hinglish, use that
  if (latestLanguage.answerLanguage === 'hindi' || latestLanguage.answerLanguage === 'hinglish') {
    return latestLanguage;
  }

  const recentStudentText = recentMessages
    .filter((message) => message.role === 'student')
    .slice(-4)
    .map((message) => message.text)
    .join(' ');

  const recentLanguage = detectQuestionLanguage(recentStudentText);

  if (recentLanguage.answerLanguage === 'hindi' || recentLanguage.answerLanguage === 'hinglish') {
    return {
      detectedLanguage: latestLanguage.detectedLanguage,
      answerLanguage: recentLanguage.answerLanguage,
    };
  }

  return latestLanguage;
};

/**
 * Builds the language instruction line that gets added to the LLM prompts.
 */
export const getAnswerLanguageInstruction = (answerLanguage) => {
  const hinglishInstruction =
    'Write the final answer in simple Roman-script Hinglish for a Class 10 student. Follow these rules strictly:\n' +
    '1. SOURCE TRANSLATION (CRITICAL): The retrieved study content is written in English. You MUST reformulate it into Hinglish — never copy English sentences from it verbatim.\n' +
    '2. Sentence structure MUST follow Hindi word order. CORRECT: "light reflect hoti hai", "image banta hai", "process hota hai". WRONG: "light is reflected", "an image is formed", "the process occurs".\n' +
    '3. Scientific and technical terms (e.g., retina, nucleus, photosynthesis, osmosis, refraction, lens, electron) may stay in English — that is correct Hinglish.\n' +
    '4. Common English words must NOT appear as standalone section headings. WRONG headings: "Introduction", "Summary", "Explanation", "Note", "Example". CORRECT headings: "Parichay", "Kya hota hai", "Saaransh", "Dhyan do", "Misal".\n' +
    '5. No Devanagari script anywhere in the response.';

  // 'english' is no longer returned by detectQuestionLanguage (it maps to 'hinglish'),
  // but we keep this branch as a safe fallback.
  if (answerLanguage === 'english') {
    return hinglishInstruction;
  }
  if (answerLanguage === 'hindi') {
    return 'Write the final answer in simple, warm, and clear Hindi using Devanagari script since the student asked in Devanagari. Keep the explanation engaging like a Bihar classroom teacher addressing their student.';
  }
  return hinglishInstruction;
};
