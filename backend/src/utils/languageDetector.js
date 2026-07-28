import { formatGlossaryForPrompt } from '../constants/scienceGlossary.js';

const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

// Intents where the student expects a science explanation \u2014 glossary is worth
// the ~1200 token cost here. GREETING/EMOTIONAL_SUPPORT are short conversational
// replies with no science vocabulary, so the glossary would be pure waste there.
const STUDY_INTENTS = new Set(['CONCEPT_QUESTION', 'EXPLAIN_MORE', 'NEXT_STEP', 'EXAM_INFO', 'CHOOSE_COURSE']);

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
 *
 * @param {string} answerLanguage - 'hinglish' | 'hindi' | 'english'
 * @param {string} [intent]       - Decider intent; when it's a study intent, the
 *                                  science glossary + vocabulary examples are appended.
 */
export const getAnswerLanguageInstruction = (answerLanguage, intent = null) => {
  if (answerLanguage === 'hindi') {
    return 'Write the final answer in simple, warm, and clear Hindi using Devanagari script since the student asked in Devanagari. Keep the explanation engaging like a Bihar classroom teacher addressing their student.';
  }

  const hinglishInstruction =
    'Write the final answer in simple Roman-script Hinglish for a Class 10 student. Follow these rules strictly:\n' +
    '1. SOURCE TRANSLATION (CRITICAL): The retrieved study content is written in English. You MUST reformulate it into Hinglish — never copy English sentences from it verbatim.\n' +
    '2. Sentence structure MUST follow Hindi word order. CORRECT: "light reflect hoti hai", "image banta hai", "process hota hai". WRONG: "light is reflected", "an image is formed", "the process occurs".\n' +
    '3. VOCABULARY RULE (CRITICAL): Common English words MUST be replaced with Hindi equivalents — do not leave ordinary English words untranslated just because they are easy. ' +
    'ONLY these types of words may stay in English: scientific terms with no clean Hindi equivalent (lens, pH, DNA, enzyme, hormone, electron, retina), chemical formulas (H2O, CO2, NaOH), units (volt, ampere, ohm, joule), and proper nouns (Newton, Mendeleev). ' +
    'When using a scientific term that DOES have a Hindi equivalent, write it as "hindi transliteration (english term)" on its FIRST mention in the response — after that, either form is fine.\n' +
    '4. Common English words must NOT appear as standalone section headings. WRONG headings: "Introduction", "Summary", "Explanation", "Note", "Example". CORRECT headings: "Parichay", "Kya hota hai", "Saaransh", "Dhyan do", "Misal".\n' +
    '5. No Devanagari script anywhere in the response.\n' +
    '6. SELF-CHECK before responding: scan your own draft for any full English sentence (English subject + English verb + English object). If you find one, rewrite it in Hindi word order before returning the answer.\n\n' +
    'EXAMPLE D — English vocabulary leakage (CRITICAL)\n' +
    '- AVOID (fully English): "Photosynthesis is a process in which plants convert carbon dioxide and water into glucose."\n' +
    '- ALSO AVOID (half-translated): "Photosynthesis ek process hai jisme plants carbon dioxide aur water ko glucose mein convert karte hain."\n' +
    '- USE (proper Hinglish): "Prakash sanshleshan (photosynthesis) ek aisi prakriya hai jisme paudhe CO2 aur paani ko glucose mein badalte hain."\n\n' +
    'EXAMPLE E — Common word replacement\n' +
    '- AVOID: "Acids are important because they are used in many different processes."\n' +
    '- ALSO AVOID: "Acids important hain because ye different processes mein used hote hain."\n' +
    '- USE: "Aml (acids) bahut zaroori hain kyunki ye kai alag-alag prakriyaon mein istemal hote hain."';

  if (intent && STUDY_INTENTS.has(intent)) {
    return `${hinglishInstruction}\n\nSCIENCE GLOSSARY (use these exact translations on first mention of each term):\n${formatGlossaryForPrompt()}`;
  }

  return hinglishInstruction;
};
