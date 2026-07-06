# FOCUS MODE 2.0 — MASTER IMPLEMENTATION PLAN

**Role:** Senior Software Engineer + Senior System Design Engineer + Senior Product Manager  
**Experience:** 20 years combined product & engineering leadership  
**Last Updated:** 2026-06-27  
**Status:** ACTIVE — Use this file as the single source of truth for all Focus Mode improvements.

---

## HOW TO USE THIS FILE

This file is a **living execution guide**. Every step below follows this exact workflow:

```
1. Pick the next OPEN step (lowest priority number)
2. Deep Discussion Phase:
   - Read the step's background, why, what, where, how
   - Ask any questions/doubts you have — all will be answered
3. Solution Presentation Phase:
   - Multiple solution options presented with edge cases, risks, tradeoffs
   - One recommended solution with full reasoning
4. Execution Phase:
   - Only after explicit "go ahead" — implement the fix
   - Exact files changed, exact lines touched
5. Verification Phase:
   - How to test the fix manually
   - What to check in browser/server logs
6. Mark DONE — move to next step
```

**Status Markers:**
- `[ ]` — Not started
- `[~]` — In discussion / being designed  
- `[>]` — Currently being implemented
- `[x]` — DONE — verified and working

---

## SYSTEM CONTEXT (Read Before Any Step)

### The 7-Step Ask Pipeline
```
Request → Step1(validate) → Step2(loadSession) → Step3(buildContext)
        → Step4(decideRetrieval/LLM#1) → Step5(retrieveContent)
        → Step6(generateResponse/LLM#2) → Step7(saveAndRespond) → Response
```

### Key Files Reference Map
```
backend/src/
  ask/
    askOrchestrator.js          ← pipeline wiring, drift cap, safety net
    step1.validateInput.js      ← input validation, focusChapter hydration
    step2.loadSession.js        ← session load, chatState sync, focus/global mode
    step3.buildContext.js       ← context compilation for LLM prompts
    step4.decideRetrieval.js    ← LLM #1: intent classifier (9 intents)
    step5.retrieveContent.js    ← vector search, NEXT_STEP topic resolver
    step6.generateResponse.js   ← LLM #2 router (intent router or legacy)
    step7.saveAndRespond.js     ← DB save, response builder, sanitizers
    intentRouter.js             ← per-intent chain, buildPromptInput, CHAPTER_COMPLETE
    promptHelpers.js            ← formatMemoryForPrompt, formatRecentHistory
  curriculum/
    nextTopicResolver.js        ← getNextTopic(chapterId, currentTopicId)
    topicResolver.js            ← getChapterCoreTopics(index, chapterId)
    curriculumIndexLoader.js    ← loadCurriculumIndex() — cached JSON reader
    curriculumIndexBuilder.js   ← builds curriculum-index.json (build-time only)
  models/
    chatSession.model.js        ← chatState schema, getDefaultChatState()
  services/
    studyMap.service.js         ← getStudyMap(), findStudyMapChapter()
  prompts/
    tutorPrompt.js              ← legacy monolithic prompt
    intents/
      conceptQuestionPrompt.js  ← CONCEPT_QUESTION intent prompt
      nextStepPrompt.js         ← NEXT_STEP intent prompt
      chooseCoursePrompt.js     ← CHOOSE_COURSE intent prompt
      examInfoPrompt.js         ← EXAM_INFO intent prompt
      greetingPrompt.js         ← GREETING intent prompt
      emotionalSupportPrompt.js ← EMOTIONAL_SUPPORT intent prompt
      explainMorePrompt.js      ← EXPLAIN_MORE intent prompt
      redirectPrompt.js         ← OUT_OF_CONTEXT intent prompt
      unsafePrompt.js           ← UNSAFE_OR_ABUSIVE intent prompt
      corePersona.js            ← shared Zuno persona text (imported by all above)
  knowledge/
    examKnowledgeService.js     ← static JSON reader for exam_patterns.json
  routes/
    studyMap.routes.js          ← GET /api/v1/study-map

frontend/src/
  pages/
    ChatPage.jsx                ← main page — all state, handleAsk, handleFocusChapterSelect
  components/
    ChatMessage.jsx             ← message rendering — student/zuno/system bubbles
    FocusModal.jsx              ← chapter selector dialog (3-step: subject→section→chapter)
    Topbar.jsx                  ← header — chapter pill, focus button, new chat, auth
    AskBar.jsx                  ← input bar — text field, send/cancel button
    SessionBar.jsx              ← session switcher (history + new chat quick access)
    HistoryPanel.jsx            ← full session history drawer
  api/
    tutorApi.js                 ← askTutor(), fetchStudyMap(), fetchSessionHistory()
  constants/
    studyModes.js               ← STUDY_MODES.focus / STUDY_MODES.global

data/
  class-10/
    science/
      physics/   ← 7 chapters (Light, Eye, Electricity, Magnetism, Energy, Environment, Resources)
      chemistry/ ← 5 chapters (Reactions, Acids/Bases, Metals, Carbon, Periodic Table)
      biology/   ← 4 chapters (Life Processes, Control, Reproduction, Heredity)
    global/
      exam_patterns.json ← Bihar Board exam metadata (23KB static JSON)

storage/
  curriculum-index.json ← Full topic-level index (built by npm run rag:index)
```

### Critical chatState Fields (MongoDB)
```js
chatState: {
  learningMode:      'idle' | 'lesson' | 'doubt' | 'quiz'  // default: 'idle'
  currentChapterId:  String | null   // e.g. "science.physics.chapter-03"
  currentTopicId:    String | null   // current topic in NEXT_STEP flow
  completedTopicIds: [String]        // topics covered via NEXT_STEP
  lastTopic:         String | null   // last topic NAME (human-readable)
  lastRetrievalQuery: String | null  // last vector search query
  lastStudyResponse:  String | null  // last answer text (800 char cap)
  pendingAction:     Mixed | null    // awaiting confirmation
}
```

### What Session Payload Returns to Frontend (step7.buildSessionPayload)
```js
session: {
  sessionId, title, status, isLocked, learningMode,
  lastTopic, lastSubject, lastSection, lastChapterId,
  sessionType,   // 'focus' | 'global' — IMMUTABLE after first turn
  messageCount, totalTokensUsed
}
// ⚠️ MISSING: completedTopicIds, currentTopicId — frontend cannot see topic progress!
```

### Intent Memory Whitelist (what LLM can write to DB per intent)
```
GREETING / EMOTIONAL_SUPPORT / OUT_OF_CONTEXT / UNSAFE_OR_ABUSIVE / EXAM_INFO → nothing
CHOOSE_COURSE    → currentSubjectId, currentSectionId, currentChapterId, learningMode
EXPLAIN_MORE     → lastDoubtTopic, lastDoubtQuestion
CONCEPT_QUESTION → lastTopic, lastDoubtTopic, lastDoubtQuestion, learningMode
NEXT_STEP        → lastTopic, learningMode (currentTopicId managed by step7 code)
```

---

## PRIORITY 1 — CRITICAL BUGS (Broken Features That Exist But Don't Work)

---

### STEP-1 [ ] Fix: `suggestedActions` Not Rendering on Frontend

**Priority:** P1 — CRITICAL  
**Type:** Frontend Bug  
**Effort:** ~2 hours  
**Impact:** HIGH — Every Zuno response already carries `suggestedActions` data. Students never see it.

#### Background & Root Cause

Every backend response from `step7.saveAndRespond.js` (line 324) includes:
```js
suggestedActions: sanitizeSuggestedActions(response.suggestedActions)
// Shape: [{ type: "next_topic", label: "Aage badhein" }]  — max 4 items
```

`tutorApi.js` `askTutor()` receives the full `finalPayload` via SSE stream.

`ChatPage.jsx` `createAnswerMessage(payload)` spreads the entire payload:
```js
const createAnswerMessage = (payload) => ({
  id: crypto.randomUUID(),
  role: 'zuno',
  ...payload,   // ← suggestedActions IS in here
});
```

So `message.suggestedActions` exists on every Zuno message object.

**The bug:** `ChatMessage.jsx` never reads or renders `message.suggestedActions`. It renders:
- `message.answer` (plain text)
- `message.sections` (structured sections)
- `message.sources` (source footnote)
- Copy + Share action buttons

`suggestedActions` is completely ignored. Every CONCEPT_QUESTION and NEXT_STEP response carries action chips that the student never sees.

#### Files That Will Change
- `frontend/src/components/ChatMessage.jsx` — add suggestedActions render block
- `frontend/src/pages/ChatPage.jsx` — add `handleSuggestedAction` handler, pass as prop
- `frontend/src/index.css` — add `.suggested-actions` and `.action-chip` styles

#### Known Edge Cases & Risks
1. **LLM hallucinating wrong `type` values** — `sanitizeSuggestedActions` in step7 already caps to 4 and validates shape. Frontend handler must also be defensive (unknown type → use label as question text).
2. **`suggestedActions` firing while another request in-flight** — `isAsking` check needed before triggering `handleAsk`.
3. **`suggestedActions` on system/student messages** — guard: only render if `message.role === 'zuno'` and `!isThinking`.
4. **Empty label or type** — backend sanitizer already filters these. Frontend: also check `action.label?.trim()` before rendering.
5. **Mobile overflow** — chips must wrap, not overflow container on small screens.

---

### STEP-2 [ ] Fix: `completedTopicIds` & `currentTopicId` Missing from Session Payload

**Priority:** P1 — CRITICAL (Blocks all progress tracking features)  
**Type:** Backend Bug  
**Effort:** ~1 hour  
**Impact:** HIGH — Frontend cannot show chapter progress without these fields.

#### Background & Root Cause

`step7.saveAndRespond.js` `buildSessionPayload()` (lines 114–130) builds what gets sent to frontend:
```js
const buildSessionPayload = (sessionId, updatedSession) => {
  const chatState = updatedSession?.chatState || {};
  return {
    sessionId,
    title,
    status,
    isLocked,
    learningMode: chatState.learningMode || 'idle',
    lastTopic: chatState.lastTopic || null,
    lastSubject: chatState.currentSubjectId || null,
    lastSection: chatState.currentSectionId || null,
    lastChapterId: chatState.currentChapterId || null,
    sessionType: updatedSession?.sessionType || 'global',
    messageCount: chatState.messageCount || 0,
    totalTokensUsed: updatedSession?.totalTokensUsed ?? 0,
    // ← NO completedTopicIds
    // ← NO currentTopicId
  };
};
```

Both `completedTopicIds` (Array\<String\>) and `currentTopicId` (String|null) ARE stored in MongoDB and ARE present on `updatedSession.chatState`. They just aren't included in the response.

Without these, frontend cannot:
- Show progress bar (X of Y topics done)
- Highlight which topics are completed in a roadmap UI
- Know which topic is currently active

#### Files That Will Change
- `backend/src/ask/step7.saveAndRespond.js` — `buildSessionPayload()` function (lines 114–130)

---

### STEP-3 [ ] Fix: `currentTopicId` Not Reset on Chapter Switch

**Priority:** P1 — CRITICAL  
**Type:** Backend Bug  
**Effort:** ~30 minutes  
**Impact:** HIGH — Student resumes from wrong topic when switching chapters.

#### Background & Root Cause

`step2.loadSession.js` (lines 69–77) handles focus mode entry:
```js
if (studyMode === 'focus' && focusChapter) {
  chatState.currentSubjectId = focusChapter.subjectId;
  chatState.currentSectionId = focusChapter.sectionId;
  chatState.currentChapterId = focusChapter.id;      // ← chapter ID updated

  if (chatState.learningMode === 'idle') {
    chatState.learningMode = 'lesson';
  }
  // ← currentTopicId NOT touched!
}
```

**Scenario A — Chapter Switch:**
- Student studies Chapter 1 (Electricity), reaches Topic 3.
- `currentTopicId = "science.physics.chapter-03.topic-03"`, `currentChapterId = "science.physics.chapter-03"`
- Student switches to Chapter 2 (Light) in FocusModal.
- `step2` sets `currentChapterId = "science.physics.chapter-01"` but `currentTopicId` stays as `"science.physics.chapter-03.topic-03"`.
- Student says "aage badhao" → `getNextTopic("science.physics.chapter-01", "science.physics.chapter-03.topic-03")` → `currentTopicId` not found in Chapter-01's topics → returns `chapter_complete` status → **wrong! Student never started Chapter-01.**

**Scenario B — Same Chapter Revisit After Completion:**
- Student finishes Chapter-01. `currentTopicId = last topic`.
- Tomorrow, student selects Chapter-01 again from FocusModal.
- `step2` doesn't change `currentTopicId` (same chapter selected).
- Student says "aage badhao" → `getNextTopic` returns `chapter_complete` immediately → **student cannot restart the chapter.**

#### Fix
```js
// step2.loadSession.js — in the focus mode block
if (studyMode === 'focus' && focusChapter) {
  const isChapterSwitch = chatState.currentChapterId !== focusChapter.id;

  chatState.currentSubjectId = focusChapter.subjectId;
  chatState.currentSectionId = focusChapter.sectionId;
  chatState.currentChapterId = focusChapter.id;

  // Reset topic pointer on chapter switch
  // completedTopicIds intentionally NOT cleared (student may want to review progress)
  if (isChapterSwitch) {
    chatState.currentTopicId = null;
  }

  if (chatState.learningMode === 'idle') {
    chatState.learningMode = 'lesson';
  }
}
```

**Note on `completedTopicIds`:** Do NOT clear it on chapter switch. Keep it for future progress display. But for same-chapter revisit after completion, `currentTopicId` must be reset to null so `getNextTopic` starts from beginning.

**Scenario B Fix:** On FocusModal chapter select, detect "this chapter was previously completed" and prompt: "Kya chapter dobara shuru karein?" → If yes, clear `currentTopicId` via API.

---

### STEP-4 [ ] Fix: `CHAPTER_COMPLETE` Dead Loop — No Recovery Path

**Priority:** P1 — CRITICAL  
**Type:** Backend Bug  
**Effort:** ~1 hour  
**Impact:** HIGH — Student gets stuck after finishing a chapter.

#### Background & Root Cause

`intentRouter.js` (lines 188–199):
```js
if (retrieval.retrievedContext === 'CHAPTER_COMPLETE') {
  return {
    status:           'answered',
    responseMode:     'study_tutor',
    title:            'Chapter Complete!',
    sections:         [{ heading: '', content: 'Iss chapter ke saare topics cover ho gaye! ...' }],
    suggestedActions: [],    // ← EMPTY! No next action.
    memoryUpdate:     {},
    tokenUsage:       0,
  };
}
```

After `CHAPTER_COMPLETE`:
1. `currentTopicId` in DB = last topic of the chapter (step7 doesn't reset it)
2. Student says anything that triggers NEXT_STEP again → `getNextTopic` returns `chapter_complete` again → same fixed message → **infinite loop**
3. `suggestedActions: []` → student has zero clickable options to proceed

**Fix Required:**
1. Add recovery `suggestedActions` to the CHAPTER_COMPLETE response
2. `ChatPage.jsx` must handle `{ type: 'switch_chapter' }` action to open FocusModal
3. Also handle `{ type: 'global_mode' }` action to switch to global mode

#### Files That Will Change
- `backend/src/ask/intentRouter.js` — CHAPTER_COMPLETE handler (lines 188–199)
- `frontend/src/pages/ChatPage.jsx` — `handleSuggestedAction` (needs to support `switch_chapter`, `global_mode` types)

---

## PRIORITY 2 — IMPORTANT GAPS (Features That Should Work But Don't)

---

### STEP-5 [ ] Add: Topics API Endpoint (`GET /api/v1/chapters/:chapterId/topics`)

**Priority:** P2 — HIGH  
**Type:** New Backend API + Frontend Integration  
**Effort:** ~3 hours  
**Impact:** HIGH — Required for all topic-level UI features (progress bar, roadmap, smart entry).

#### Background & Root Cause

`studyMap.service.js` builds the study map from markdown file metadata. It only includes:
```js
{ id, number, title, originalScienceChapterNumber }
```
No topics. Topics are in `storage/curriculum-index.json` — a separate JSON file loaded by `curriculumIndexLoader.js`.

`nextTopicResolver.js` already loads this index and has `getChapterCoreTopics()` working. But there's no API to expose topic lists to the frontend.

Without this API, frontend cannot:
- Show "Electricity chapter mein 8 topics hain"
- Display a topic roadmap
- Calculate progress percentage (X of Y topics done)
- Show which specific topic is currently active

#### New Files
- `backend/src/curriculum/topicService.js` — UI-safe topic getter
- New route in `backend/src/routes/studyMap.routes.js`

#### New `tutorApi.js` function
- `fetchChapterTopics(chapterId)` → `GET /api/v1/chapters/:chapterId/topics`

#### Response Shape
```js
{
  chapterId: "science.physics.chapter-03",
  chapterTitle: "Electricity",
  totalTopics: 8,
  topics: [
    { topicId: "science.physics.chapter-03.topic-01", title: "Electric Current", order: 1 },
    { topicId: "science.physics.chapter-03.topic-02", title: "Ohm's Law", order: 2 },
    ...
  ]
}
```

#### Edge Cases
1. `chapterId` not found in `curriculum-index.json` — return 404 with clear error message
2. Chapter exists in studyMap but has no core topics in curriculumIndex — return empty array (graceful)
3. `curriculum-index.json` fails to load (corrupted file) — 500 error, log clearly
4. Rate limiting — this endpoint should share the global API limiter (not ask-specific)
5. Frontend fetches topics when chapter selected in FocusModal — should cache per-session to avoid repeated calls for the same chapterId

---

### STEP-6 [ ] Add: Proactive "Smart Entry" — Zuno Initiates Chapter Automatically

**Priority:** P2 — HIGH  
**Type:** Frontend Feature + Backend Prompt Enhancement  
**Effort:** ~4 hours  
**Impact:** HIGH — Transforms Focus Mode from "passive filter" to "active teaching session"

#### Background & Root Cause

**Current Flow:**
1. Student selects "Electricity" in FocusModal
2. FocusModal closes
3. Chat shows: "Focus on. Ab hum 'Electricity' padhenge — jo bhi samajhna ho, seedha poochho."
4. Student stares at blank screen — doesn't know what to type
5. Student either types something random or gives up

**Target Flow:**
1. Student selects "Electricity" in FocusModal
2. FocusModal closes
3. Chat shows: "Focus on. Ab hum 'Electricity' padhenge..." (system message)
4. **Automatically:** Zuno says "Chalo shuru karte hain! Pehla topic hai 'Electric Current'..." (without student typing anything)

**How to implement:** `handleFocusChapterSelect` in `ChatPage.jsx` triggers an automatic `handleAsk('Shuru karo', STUDY_MODES.focus)` call after setting the focus state.

**What happens on backend:** `"Shuru karo"` → Decider classifies as `NEXT_STEP` (student saying start/proceed) → Step5 calls `getNextTopic(chapterId, null)` → `currentTopicId=null` means "start from beginning" → returns Topic 1 → Zuno teaches Topic 1.

#### Edge Cases & Risks
1. **Returning student with `currentTopicId` already set:** Auto-ask will resume from next topic, not Topic 1. This is CORRECT behavior — student left off at Topic 3, we continue from Topic 4. BUT student should see a message like "Pehle Topic 3 tha — wahan se aage chalein?" Needs to be handled by prompt or a pre-check.
2. **`isAsking` guard:** If `handleAsk` is already running when chapter is selected, auto-ask must be skipped. The `controllerRef.current` check in `handleAsk` handles this.
3. **Decider misclassifying "Shuru karo":** Risk — Decider may classify as `GREETING` or `CHOOSE_COURSE`. Mitigation: Add "Shuru karo" / "Begin" / "Start karo" to `nextStepPrompt` examples in decider prompt.
4. **Network failure on auto-ask:** Handled by existing `catch(askError)` in `handleAsk`.
5. **Double system message:** System focus message + auto-ask response may feel like 2 messages at once. UX consideration: delay auto-ask by 500ms after focus message appears.
6. **Guest limit:** Auto-ask consumes one guest turn. If guest is at limit-1, auto-ask would hit the limit. This is acceptable — the student had selected a chapter to study, using one turn is reasonable.

---

### STEP-7 [ ] Add: Chapter Topic Progress Bar in Topbar

**Priority:** P2 — HIGH  
**Type:** Frontend Feature (Requires STEP-5 and STEP-2)  
**Effort:** ~2 hours  
**Dependencies:** STEP-5 (Topics API), STEP-2 (completedTopicIds in session payload)  
**Impact:** MEDIUM-HIGH — Visual progress makes Focus Mode feel meaningful and goal-oriented

#### Background

After STEP-5 and STEP-2:
- Frontend knows: total topics for selected chapter (from Topics API)
- Frontend knows: `completedTopicIds` count (from session payload, STEP-2)
- Frontend knows: `currentTopicId` (from session payload, STEP-2)

**Target:** In Topbar, next to the chapter pill:
```
[• Electricity]  [Topic 3/8]
```

Or, on hover/click of the chapter pill, a tooltip showing topic names with checkmarks.

#### Data Flow
```
ChatPage.jsx
  ├── selectedChapterId → fetch fetchChapterTopics(chapterId) → chapterTopics[]
  ├── messages → last message's session payload → session.completedTopicIds
  └── Derived: { completed: completedTopicIds.length, total: chapterTopics.length }
      → passed as topicProgress prop to Topbar
```

#### Edge Cases
1. **`completedTopicIds` only fills via NEXT_STEP flow:** If student asks concept questions instead of using "aage badhao", topics don't get marked. Progress bar may show 0/8 even if student has learned everything. This is a known limitation — document it, fix in Phase 3.
2. **Topics API call timing:** Don't fetch on every render. Fetch once when `selectedChapterId` changes. Cache in `useState`.
3. **Chapter with 0 core topics:** Show progress bar as "Topics: N/A" or hide it. Don't divide by zero.
4. **Session without history (new session):** `completedTopicIds` is empty array. Progress bar shows 0/N — correct.
5. **Progress from DB vs. local:** `completedTopicIds` comes from `session` payload on each response. It's always fresh from DB. No stale state risk.

---

## PRIORITY 3 — EXPERIENCE IMPROVEMENTS (Smart Tutor Behavior)

---

### STEP-8 [ ] Improve: Chapter-Aware Empty State Chips

**Priority:** P3 — MEDIUM  
**Type:** Frontend Enhancement  
**Effort:** ~1 hour  
**Dependencies:** None (can use `selectedChapter` which is already available)  
**Impact:** MEDIUM — Students entering Focus Mode see relevant starter prompts

#### Background

Current empty state in `ChatPage.jsx` (lines 551–554):
```jsx
<button className="chat-empty-chip" onClick={() => handleAsk('Newton ka pehla niyam kya hai?')}>
  ⚡ Newton ka pehla niyam kya hai?
</button>
<button className="chat-empty-chip" onClick={() => handleAsk('Carbon dioxide kaise banta hai?')}>
  🧪 Carbon dioxide kaise banta hai?
</button>
<button className="chat-empty-chip" onClick={() => handleAsk('Photosynthesis kya hota hai?')}>
  🌿 Photosynthesis kya hota hai?
</button>
```

These are **hardcoded** and **irrelevant** when student is in Focus Mode on "Electricity" chapter. Seeing "Photosynthesis kya hota hai?" when studying Electricity is confusing and breaks the focused experience.

**Target:** When Focus Mode is active, chips become chapter-specific:
```jsx
// If studying Electricity:
⚡ "Electricity chapter shuru karo"
📝 "Is chapter se exam mein kya aata hai?"
🔍 "Pehla topic kya hai?"
```

#### Implementation
```js
const emptyStateChips = useMemo(() => {
  if (studyMode === STUDY_MODES.focus && selectedChapter) {
    return [
      { emoji: '📖', label: `${selectedChapter.title} shuru karo`, question: 'Shuru karo' },
      { emoji: '📝', label: 'Is chapter se exam mein kya aata hai?', question: 'Is chapter se Bihar Board exam mein kya aata hai?' },
      { emoji: '❓', label: 'Chapter overview do', question: 'Is chapter ka overview do — kya kya topics hain?' },
    ];
  }
  return [
    { emoji: '⚡', label: 'Newton ka pehla niyam kya hai?', question: 'Newton ka pehla niyam kya hai?' },
    { emoji: '🧪', label: 'Carbon dioxide kaise banta hai?', question: 'Carbon dioxide kaise banta hai?' },
    { emoji: '🌿', label: 'Photosynthesis kya hota hai?', question: 'Photosynthesis kya hota hai?' },
  ];
}, [studyMode, selectedChapter]);
```

---

### STEP-9 [ ] Improve: `nextStepPrompt` — Add Suggested Action After Teaching

**Priority:** P3 — MEDIUM  
**Type:** Backend Prompt Engineering  
**Effort:** ~1 hour  
**Impact:** MEDIUM — After learning a topic, student always has a clear next action

#### Background

Current `nextStepPrompt.js` JSON output contract (line 43):
```js
"suggestedActions": [{"type": "next_topic", "label": "Aage badhein"}]
```

Only one action. After STEP-1 fix (suggestedActions renders), student will see "Aage badhein" chip. But there's no option to:
- Ask a doubt about what was just taught
- See an example question
- Explain the topic more simply

**Target:** After teaching a topic, Zuno should offer 2-3 contextual actions:
```json
"suggestedActions": [
  { "type": "next_topic",    "label": "Aage badhein" },
  { "type": "explain_more",  "label": "Thoda aur samjhao" },
  { "type": "concept_check", "label": "Ek sawaal poochho" }
]
```

#### Files That Will Change
- `backend/src/prompts/intents/nextStepPrompt.js` — update JSON contract

#### Edge Case
`concept_check` type needs handling in `ChatPage.jsx` `handleSuggestedAction`. Suggested message: "Is topic pe ek sawaal poochho jo Bihar Board exam mein poocha ja sakta hai."

---

### STEP-10 [ ] Improve: `conceptQuestionPrompt` — Focus-Mode Contextual Redirect

**Priority:** P3 — MEDIUM  
**Type:** Backend Prompt Engineering  
**Effort:** ~2 hours  
**Impact:** MEDIUM — Student asking off-chapter questions gets smart redirect, not generic "not available"

#### Background

**Current behavior:** In Focus Mode on "Electricity", student asks "Photosynthesis kya hai?":
- Decider: `CONCEPT_QUESTION`
- Step5: vector search with `metadataFilter = { section: 'Physics', chapter_no: 3 }` (Electricity chapter)
- Result: 0 chunks found for Photosynthesis in Physics
- LLM: "Ye topic hamare Class 10 Bihar Board Science material mein nahi hai" — **WRONG!** It IS in Biology.

**Root Cause:** `conceptQuestionPrompt.js` says to respond with "not in material" if context is empty. But the context was empty because of the focus filter, not because the topic doesn't exist.

**Target behavior:** When focus mode is active and retrieved context is empty:
```
"Photosynthesis, Biology chapter mein hai — Electricity mein nahi. 
Kya Biology pe switch karein? [Haan, Biology switch karo] [Electricity mein rehna hai]"
```

**Implementation approach:** 
- `conceptQuestionPrompt.js` gets `{focusChapter}` variable already
- Add instruction: "If `focusChapter` is set AND context is empty, tell student this topic might be in a different chapter — suggest switching to global mode to search all chapters"
- Frontend: `handleSuggestedAction` handles `{ type: 'search_globally' }` type

---

## PRIORITY 4 — CONTENT EXPANSION (Knowledge Quality Improvements)

---

### STEP-11 [ ] Add: Foundation Content Files (Critical Missing Knowledge)

**Priority:** P2-P4 (Product-critical gap)  
**Type:** Content Creation + Re-indexing  
**Effort:** ~4 hours writing + 30 min indexing  
**Impact:** HIGH — Fixes core product rule violation for broad/meta questions

#### Background & Root Cause

**Core Product Rule:** "The tutor must answer ONLY from retrieved/indexed source content."

**Current violation:** When student asks:
- "Science kya hai?" → LLM answers from general knowledge ❌
- "Padhai yaad nahi rehti, kya karein?" → No content to retrieve ❌
- "Zuno kya kar sakta hai?" → No content ❌
- "Bihar Board mein Science ka syllabus kya hai?" → Goes to exam_patterns.json (okay), but broad syllabus context missing ❌

These questions cannot be answered from the 16 science chapters. Foundation content files needed.

#### Files to Create

**File 1: `data/class-10/global/science-overview.md`**
Content includes:
- Class 10 Bihar Board Science overview
- What is Science / Physics / Chemistry / Biology
- Why these subjects matter for Bihar Board exam
- Complete chapter list with brief 1-line descriptions
- How to use Zuno for each subject

**File 2: `data/class-10/global/study-strategies.md`**
Content includes:
- "Padhai yaad kaise rakhen" — spaced repetition in simple language
- "Exam ki tayyari 30 din mein kaise karein" — study plan
- "Notes kaise banayein" — note-making strategies
- "MCQ kaise solve karein" — exam tactics
- "Formulas kaise yaad karein" — memory tips

**File 3: `data/class-10/global/zuno-guide.md`**
Content includes:
- "Zuno kya hai aur kya kar sakta hai"
- "Focus Mode kya hai aur kaise use karein"
- "Kaun se sawaal pooch sakte hain"
- "Bihar Board Science chapters jo available hain"
- "Kis sawaal ka jawab nahi milega aur kyon"

#### After Creating
Run: `npm run rag:index` — these files will be picked up by `markdownLoader.js` from `data/class-10/` directory.

**Important:** Check `markdownLoader.js` to verify it loads from `data/class-10/global/` as well as `data/class-10/science/`. May need to update the loader's base path.

---

### STEP-12 [ ] Add: Chapter-Level Metadata to Science Markdown Files

**Priority:** P3  
**Type:** Content Enhancement  
**Effort:** ~3 hours  
**Impact:** MEDIUM — Richer retrieval context, better answers

#### Background

Current chapter files (e.g., `electricity.md`) have headings and content but lack:
- Bihar Board-specific mark distribution ("5 marks ke questions aate hain")
- Common student misconceptions per topic
- PYQ (Previous Year Questions) bank embedded in the chapter
- Formula quick-reference section

#### Files to Update
All 16 chapter markdown files in `data/class-10/science/`.

Add at end of each chapter:
```markdown
## Bihar Board Exam Patterns
- Is chapter se usually X marks ke questions aate hain
- Important topics: [list]
- Common mistake: [example]

## Formula Sheet
| Formula | Variable | Unit |
|---------|----------|------|

## Previous Year Questions (Bihar Board)
1. [Question from 2022]
2. [Question from 2021]
```

After updating: `npm run rag:index` to re-index.

---

## PRIORITY 5 — ARCHITECTURE IMPROVEMENTS (Long-Term, Post-Launch)

---

### STEP-13 [ ] Implement: Real `learningMode` State Machine

**Priority:** P5 — Post-Launch  
**Type:** Architecture  
**Effort:** ~1 week  
**Impact:** HIGH when done — Enables genuine "doubt mode" and "quiz mode"

#### Background

`learningMode: 'doubt' | 'quiz'` are in the schema but never actually used:

- `'doubt'` never set: When student asks off-topic question in Focus Mode, `learningMode` should become `'doubt'`. After doubt resolved, LLM should offer to return to main topic.
- `'quiz'` never set: After topic completion (NEXT_STEP), LLM could ask a quick comprehension question. If student answers, move to `'quiz'` mode for that turn.

**Why deferred to P5:** Requires:
1. New `DOUBT_REDIRECT` intent in Step4 decider
2. State machine enforcement in Step3/Step6 based on `learningMode`
3. New prompts for quiz flow
4. Significant testing to avoid breaking current flow

---

### STEP-14 [ ] Implement: FocusModal Chapter Progress Indicators

**Priority:** P4-P5  
**Type:** Frontend Enhancement  
**Dependencies:** STEP-5, STEP-2  
**Effort:** ~3 hours

#### Background

FocusModal Step 3 (chapter list) currently shows:
```
[Ch 3]
Electricity
```

After STEP-5 and STEP-2, it could show:
```
[Ch 3] ✅ 3/8 topics done
Electricity
```

For previously started chapters. This tells the student "oh, I was here — let me continue" vs "I haven't started this yet."

---

### STEP-15 [ ] Fix: FocusModal Hardcoded Subjects List

**Priority:** P4  
**Type:** Frontend Technical Debt  
**Effort:** ~1 hour

#### Background

`FocusModal.jsx` (lines 17–24) has hardcoded subjects:
```js
const baseSubjects = [
  { id: 'hindi', title: 'Hindi', icon: TranslateRounded },
  { id: 'english', title: 'English', icon: AutoStoriesRounded },
  { id: 'math', title: 'Math', icon: FunctionsRounded },
  { id: 'science', title: 'Science', icon: ScienceRounded },
  { id: 'social-science', title: 'Social Science', icon: PublicRounded },
  { id: 'sanskrit', title: 'Sanskrit', icon: MenuBookRounded },
];
```

When we add Math content, this list needs manual update. Also, section icons are hardcoded by `section.title.toLowerCase()`.

**Fix:** Drive the subject list entirely from `studyMap.focusStudy.subjects`. Show unavailable subjects as "Coming Soon" only if they appear in a config/whitelist, not a hardcoded array.

---

### STEP-16 [ ] Implement: Session Restart for Completed Chapters

**Priority:** P4  
**Type:** UX Feature  
**Effort:** ~3 hours  
**Dependencies:** STEP-2

#### Background

When student has completed a chapter (all topics covered via NEXT_STEP) and tries to study it again:
- CHAPTER_COMPLETE fires immediately
- No way to restart without manual state clearing

**Fix:** New API endpoint `POST /api/v1/sessions/:sessionId/reset-chapter` that:
- Sets `currentTopicId = null`
- Clears `completedTopicIds = []`
- Resets `learningMode = 'lesson'`

Frontend: In CHAPTER_COMPLETE message (after STEP-4 fix), add action: `{ type: 'restart_chapter', label: 'Chapter dobara shuru karo' }`.

---

## EXECUTION LOG (Update As Work Progresses)

| Step | Status | Date Started | Date Done | Notes |
|------|--------|-------------|-----------|-------|
| STEP-1 | [x] | 2026-06-27 | 2026-06-27 | suggestedActions render added to ChatMessage.jsx & ChatPage.jsx |
| STEP-2 | [x] | 2026-06-27 | 2026-06-27 | completedTopicIds and currentTopicId added in step7 session payload |
| STEP-3 | [x] | — | 2026-06-30 | currentTopicId reset on chapter switch + cross-session progress sync already in step2 |
| STEP-4 | [x] | — | 2026-06-30 | suggestedActions added (switch_chapter + global_mode) + frontend handlers wired; manual-type loop is P4 gap (STEP-16) |
| STEP-5 | [x] | 2026-06-27 | 2026-06-27 | Added GET /chapters/:chapterId/topics API |
| STEP-6 | [x] | 2026-06-27 | 2026-06-27 | Smart entry auto-ask implemented with action chips |
| STEP-7 | [x] | 2026-06-27 | 2026-06-27 | FocusProgressHeader roadmap implemented |
| STEP-8 | [x] | 2026-06-27 | 2026-06-27 | Chapter-aware chips solved inherently by STEP-6 |
| STEP-9 | [x] | 2026-06-27 | 2026-06-27 | Fixed decider bias & nextStepPrompt Hinglish rules |
| STEP-10 | [x] | — | 2026-06-30 | Global fallback in step5 + deterministic redirect in intentRouter (no LLM, CHAPTER_COMPLETE pattern) |
| STEP-11 | [x] | — | 2026-06-30 | Replaced with prompt updates: corePersona (capabilities) + redirectPrompt (study tips warmth). No new intents, no RAG files. |
| STEP-12 | [x] | — | 2026-06-30 | Added Exam Focus + Key Formulas + Important Questions to top 5 chapters. Run npm run rag:index to apply. |
| STEP-13 | [ ] | — | — | State machine (post-launch) |
| STEP-14 | [ ] | — | — | FocusModal progress |
| STEP-15 | [ ] | — | — | FocusModal hardcoded subjects |
| STEP-16 | [ ] | — | — | Chapter restart API |

---

## DECISION LOG (Record Key Engineering Decisions)

| Decision | Chosen Approach | Reason | Date |
|----------|----------------|--------|------|
| — | — | — | — |

---

## OPEN QUESTIONS (Pending Clarification)

| # | Question | Raised By | Status |
|---|----------|-----------|--------|
| — | — | — | — |
