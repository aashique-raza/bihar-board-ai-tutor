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
 * Single question ki text script analyze karke target script language set karta hai.
 * Bug Fix: Strict Roman script forcing hata kar dynamic alignment set kiya gaya hai.
 */
export const detectQuestionLanguage = (question) => {
  const text = String(question || '').trim();

  // Core Fix: Agar query me Devanagari characters hain, toh output language ko bhi Devanagari Hindi lock karo
  if (DEVANAGARI_PATTERN.test(text)) {
    return {
      detectedLanguage: 'hindi',
      answerLanguage: 'hindi', // Upgraded to genuine Hindi instead of forcing 'hinglish'
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
    // English questions ko bhi Hinglish mein answer karo
    // Bihar Board students Hinglish samajhte hain — aur vector store Hinglish mein indexed hai
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
 * Conversation ki dynamic context analysis script lock karta hai.
 */
export const detectConversationLanguage = ({ question, recentMessages = [] }) => {
  const latestLanguage = detectQuestionLanguage(question);

  // Agar user live turn me pure Hindi script ya Hinglish use kar raha hai, toh use priority do
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
 * Downstream prompts ke liye target system language instructions generate karta hai.
 */
export const getAnswerLanguageInstruction = (answerLanguage) => {
  // Note: answerLanguage 'english' ab set nahi hota (detectQuestionLanguage mein 'hinglish' ho gaya)
  // Ye case ab practically trigger nahi hoga — but safety ke liye hinglish instruction return karo
  if (answerLanguage === 'english') {
    return 'Write the final answer in simple Hinglish for a Class 10 student. Use Roman script only, like "Nutrition ek process hai". Do not use Devanagari/Hindi script.';
  }
  if (answerLanguage === 'hindi') {
    return 'Write the final answer in simple, warm, and clear Hindi using Devanagari script since the student asked in Devanagari. Keep the explanation engaging like a Bihar classroom teacher addressing their student.';
  }
  return 'Write the final answer in simple Hinglish for a Class 10 student. Use Roman script only, like "Nutrition ek process hai". Do not use Devanagari/Hindi script.';
};