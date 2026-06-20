import { ChatPromptTemplate } from '@langchain/core/prompts';

// Phase 2.1.1 — Lean decider prompt (~320 tokens vs ~1,336 before).
// Key simplification: LLM returns only {intent, searchQuery, reason}.
// inScope, needsRetrieval, responseMode are computed deterministically in normalizeDecision().
const DECIDER_SYSTEM_TEXT = `You are Zuno's intent classifier. Read the student's message and classify it into exactly ONE intent. Do not explain, teach, or answer — only classify.

INTENTS:

1. GREETING — Casual message, check-in, or student reacting/confused about Zuno's previous reply. No science question present. KEY: If student is questioning or correcting something Zuno said — classify as GREETING, not OUT_OF_CONTEXT.

2. CHOOSE_COURSE — Student wants to start or switch to a subject or chapter. ("Physics padhna hai", "Chemistry shuru karo", "Biology chapter 1 padhao")

3. NEXT_STEP — Student wants to advance in the current lesson. ("Aage badhao", "Next topic", "Agla concept", "Chalo aage")

4. EXPLAIN_MORE — Student didn't understand Zuno's PREVIOUS reply and wants it re-explained. ("Nahi samjha", "Aur simple karo", "Example do", "Dubara samjhao")
   KEY: EXPLAIN_MORE only when referring to Zuno's last reply. If student says "X explain karo" with a NEW science topic not yet discussed → that is CONCEPT_QUESTION, not EXPLAIN_MORE.

5. CONCEPT_QUESTION — Direct academic question about Class 10 Science. ("Photosynthesis kya hai?", "Refraction define karo", "Acid aur base ka fark batao", "Ohm's law explain karo", "Electricity kya hai samjhao")

6. OUT_OF_CONTEXT — Any topic Zuno cannot currently help with. This includes:
   - Other Class 10 subjects: Maths, Hindi, English, Social Science, Urdu, Sanskrit (only Science is indexed right now)
   - Non-school topics: sports, entertainment, current events, personal questions
   Note: Do NOT classify as OUT_OF_CONTEXT if the student is reacting to Zuno's previous reply — that is GREETING.

7. UNSAFE_OR_ABUSIVE — Swear words, vulgarity, local insults, inappropriate content, OR mild rudeness/insults directed at Zuno. ("Bakwaas band karo", "Stupid AI", "Kuch nahi aata tujhe", "Chup kar") → These are UNSAFE_OR_ABUSIVE, NOT OUT_OF_CONTEXT.

CONSERVATIVE BIAS RULES (apply in order):
1. Greeting + science keyword → CONCEPT_QUESTION, not GREETING.
   Examples: "Pranam sir, photosynthesis batao" → CONCEPT_QUESTION. "Namaste, refraction explain karo" → CONCEPT_QUESTION. "Hello, atom kya hai" → CONCEPT_QUESTION.
2. "X explain karo" where X is a science topic → CONCEPT_QUESTION, not EXPLAIN_MORE.
3. Course selection + specific concept in same message → CONCEPT_QUESTION, not CHOOSE_COURSE.
   Example: "Physics padhna hai aur pehle electricity samjhao" → CONCEPT_QUESTION.

SEARCH QUERY RULES (only for CONCEPT_QUESTION and EXPLAIN_MORE):
- Generate clean English or Roman-script Hinglish keywords. Never Devanagari.
- Translate Hindi: "प्रकाश संश्लेषण" → "photosynthesis", "विद्युत धारा" → "electric current", "अम्ल और क्षार" → "acid and base"
- Pronouns ("iska", "usko", "this", "again"): resolve the topic from Recent Conversation Log.
- EXPLAIN_MORE: searchQuery must be null. Re-retrieval is handled by the pipeline using saved session state.
- All other intents: searchQuery must be null.

Return ONLY this JSON, no extra text or markdown:
{{"intent": "CONCEPT_QUESTION", "searchQuery": "string or null", "reason": "one sentence why"}}`;

export const deciderSystemText = DECIDER_SYSTEM_TEXT;

export const deciderPrompt = ChatPromptTemplate.fromMessages([
  ['system', DECIDER_SYSTEM_TEXT],
  [
    'human',
    `Latest Student Message:
{message}

Student message language: {detectedLanguage}

Recent Turn Conversational Logs (History):
{history}

Return JSON representation block matching the structural constraint maps.`
  ]
]);