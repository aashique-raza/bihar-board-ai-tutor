# FOCUS MODE — SMART CROSS-SESSION ARCHITECTURE
**File Type:** Living Architecture Document (not a task list — see FOCUS_MODE_MASTER_PLAN.md for tasks)  
**Author Role:** Senior SE + System Design Engineer + Product Manager  
**Last Updated:** 2026-06-28  
**Status:** DESIGN PHASE — Ready for Phase 1 implementation

---

## HOW THIS FILE FITS THE PROJECT

```
FOCUS_MODE_MASTER_PLAN.md   ← session-level bugs & improvements (Steps 1–16)
                                    ↓ depends on
FOCUS_MODE_DB_ARCHITECTURE.md ← THIS FILE: cross-session DB layer + smart features
```

The master plan fixes what's BROKEN inside a single session.  
This file designs what's MISSING across sessions: progress persistence, smart resume, events, and caching.

**Read this file top-to-bottom before starting Phase 1 implementation.**  
Every section connects to the next. Nothing here is standalone.

---

## 0. WHAT WE'RE BUILDING AND WHY

### The Core Problem (as a student)
> "Maine kal Electricity ke 4 topics padhe. Aaj wapas aaya, nayi chat li — sab kuch bhool gaya. Main wahi se nahi shuru kar sakta jahan rukka tha."

### What "Smart Focus Mode" Actually Means

| Dimension | Current State | Target State |
|-----------|--------------|--------------|
| Progress | Lost on session exhaust | Persists forever across all sessions |
| Resume | Always starts from zero | Resumes exactly where student left off |
| Welcome | Generic system message | "Wapas aaye! Topic 5 — Ohm's Law tak the. Aage chalein?" |
| Action chips | Static, random | Context-aware based on last study state |
| FocusModal | Chapter list only | "Continue" section showing in-progress chapters |
| Cross-device | No | Same userId → same progress on any device |
| Chapter completion | Gets stuck (CHAPTER_COMPLETE loop) | Celebration + clear next step |
| Engagement | Unknown | Time per topic, doubts per topic, revisit count |

### What Will NOT Be Built (MVP Scope)
- ❌ Quiz mode (STEP-13 in master plan — post-launch)
- ❌ Syllabus dashboard (16-chapter overview)
- ❌ Streak tracking (Phase 5, after data exists)
- ❌ ML-based weak topic detection (needs 3 months data first)
- ❌ Push notifications ("aaj padhai nahi ki")
- ❌ Social features (share progress)

---

## 1. CURRENT DATA FLOW (Understand Before Changing)

```
CURRENT FOCUS MODE DATA FLOW:
══════════════════════════════════════════════════════════════════

Browser                  Backend                    MongoDB
  │                         │                          │
  ├─ POST /ask ─────────────►                          │
  │   {sessionId, question,  │                          │
  │    studyMode:'focus',    │                          │
  │    focusChapter:{id,..}} │                          │
  │                         ├─ Step2.loadSession ──────►
  │                         │   findChatSession()       │
  │                         │◄─────────────────── chatState{
  │                         │                     currentChapterId,
  │                         │                     currentTopicId,
  │                         │                     completedTopicIds[]}
  │                         │                          │
  │                         ├─ Step4.decideRetrieval    │
  │                         ├─ Step5.retrieveContent    │
  │                         ├─ Step6.generateResponse   │
  │                         │                          │
  │                         ├─ Step7.saveAndRespond ───►
  │                         │   updateChatSession()     │
  │                         │   (chatState $set)        │
  │◄─── response ───────────┤                          │
  │  {answer, session:{     │                          │
  │   completedTopicIds,    │                          │
  │   currentTopicId, ..}}  │                          │
  │                         │                          │
  ▼                         ▼                          ▼
ChatPage.jsx state        (dies with session)    chat_sessions collection
[completedTopicIds]                              chatState embedded doc
       │
       ▼ SESSION EXHAUSTS / USER CLOSES TAB
       ✗ ALL PROGRESS GONE
```

**The root problem:** `completedTopicIds` lives in `chatState` which is embedded in a single `chat_sessions` document. When session exhausts (token limit), a NEW session starts — with zero `completedTopicIds`. There is NO cross-session progress store.

---

## 2. TARGET DATA FLOW (What We're Building)

```
TARGET FOCUS MODE DATA FLOW:
══════════════════════════════════════════════════════════════════

Browser                  Backend                    MongoDB
  │                         │                          │
  │ (page load / chapter    │                          │
  │  selected)              │                          │
  ├─ GET /chapter-progress/{id} ──────────────────────►
  │                         │         chapter_progress collection
  │◄── {progressPercent,    │◄───────────────────────── {
  │     currentTopicId,     │         completedTopicIds[],
  │     completedTopicIds,  │         currentTopicId,
  │     status, recommendation} │     status, totalTimeSpent, ..}
  │                         │                          │
  ├─ POST /ask ─────────────►                          │
  │   {sessionId, ..}        │                          │
  │                         ├─ Step2.loadSession        │
  │                         │   + loadChapterProgress() │──► chapter_progress
  │                         │                          │
  │                         ├─ Step7.saveAndRespond     │
  │                         │   updateChatSession()  ──►│ chat_sessions
  │                         │   updateChapterProgress() ►│ chapter_progress ($set atomic)
  │                         │   logStudyEvent()    ────►│ study_events (fire+forget)
  │◄── response ────────────┤                          │
  │  {answer, session:{     │                          │
  │   completedTopicIds,    │                          │
  │   currentTopicId},      │                          │
  │   chapterProgress:{     │                          │
  │   progressPercent, ..}} │                          │
  │                         │                          │
  ▼ SESSION EXHAUSTS        ▼                          ▼
  New session starts   (new session)              chapter_progress
  GET /chapter-progress/{id} ──────────────────► STILL HAS PROGRESS ✓
  → "Wapas aaye! Topic 5 se continue karein?"
```

---

## 3. DATABASE ARCHITECTURE

### 3.1 — New Collections Overview

```
Current collections:
  chat_sessions     ← per-session state (KEEP, modify)
  chat_history      ← message log (KEEP, add suggestedActions field)
  users             ← user accounts (KEEP, no changes)

New collections to create:
  chapter_progress  ← THE CORE: cross-session progress per user per chapter
  study_events      ← append-only event log (analytics, future ML)
  user_study_stats  ← materialized aggregates (quick resume, streak)
```

---

### 3.2 — `chapter_progress` Collection (CORE — Build This First)

**Purpose:** Single source of truth for how far a student has gotten through a chapter, across ALL sessions.

**Cardinality:** 1 document per (user × chapter). Max 16 docs per user (one per chapter).

```js
// backend/src/models/chapterProgress.model.js

import mongoose from 'mongoose';

const topicEngagementSchema = new mongoose.Schema({
  topicId:        { type: String, required: true },
  firstVisitedAt: { type: Date,   default: null },
  completedAt:    { type: Date,   default: null },
  doubtsAsked:    { type: Number, default: 0    },
  explainMoreCount: { type: Number, default: 0  },
  timeSpentSec:   { type: Number, default: 0    },
  revisitCount:   { type: Number, default: 0    },
}, { _id: false });

const chapterProgressSchema = new mongoose.Schema(
  {
    // ─── Identity ───────────────────────────────────────────
    userId:    { type: String, default: null,  index: true },
    guestId:   { type: String, default: null },
    chapterId: { type: String, required: true, index: true },
    // Denormalized for fast subject-level queries (no join needed)
    subjectId: { type: String, default: null },
    sectionId: { type: String, default: null },
    chapterTitle: { type: String, default: null }, // English (from curriculum-index)

    // ─── Status ─────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['not_started', 'in_progress', 'completed', 'revising'],
      default: 'in_progress',
    },

    // ─── Progress Pointers ──────────────────────────────────
    currentTopicId:    { type: String, default: null },
    completedTopicIds: { type: [String], default: [] },
    skippedTopicIds:   { type: [String], default: [] },
    totalCoreTopics:   { type: Number, default: 0 }, // snapshot at first access
    progressPercent:   { type: Number, default: 0 }, // computed: completedTopicIds.length / totalCoreTopics * 100

    // ─── Engagement Totals ──────────────────────────────────
    totalTimeSpentSec:       { type: Number, default: 0 },
    totalMessagesExchanged:  { type: Number, default: 0 },
    totalDoubtsAsked:        { type: Number, default: 0 },
    totalExplainMoreCount:   { type: Number, default: 0 },
    totalSessionsCount:      { type: Number, default: 0 },

    // ─── Topic-Level Engagement ─────────────────────────────
    // Sparse array — only topics the student has actually visited appear here.
    topicEngagement: { type: [topicEngagementSchema], default: [] },

    // ─── Session Linkage ────────────────────────────────────
    linkedSessionIds:  { type: [String], default: [] }, // all sessions that touched this chapter
    primarySessionId:  { type: String,  default: null }, // most recent session

    // ─── Timestamps ─────────────────────────────────────────
    startedAt:    { type: Date, default: Date.now },
    lastStudiedAt: { type: Date, default: Date.now },
    completedAt:  { type: Date, default: null },

    // ─── Versioning ─────────────────────────────────────────
    // Snapshot of curriculum-index.json version used when this doc was created.
    // Used to detect curriculum updates that may invalidate progress.
    curriculumVersion: { type: Number, default: 1 },
    schemaVersion:     { type: Number, default: 1 },
  },
  {
    timestamps: true,
    collection: 'chapter_progress',
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// PRIMARY: One document per user+chapter. Unique enforced at DB level.
// Also the main read path: "get progress for user X in chapter Y"
chapterProgressSchema.index({ userId: 1, chapterId: 1 }, { unique: true, sparse: true });

// GUEST path: same uniqueness for guest users (guestId replaces userId)
chapterProgressSchema.index({ guestId: 1, chapterId: 1 }, { unique: true, sparse: true });

// LIST path: "show user's in-progress chapters sorted by recency" (FocusModal "Continue" section)
chapterProgressSchema.index({ userId: 1, status: 1, lastStudiedAt: -1 });

// SUBJECT path: "what % of Physics have I done?" (future dashboard)
chapterProgressSchema.index({ userId: 1, subjectId: 1 });

// SESSION linkage path: "which chapter_progress docs link to this session?"
chapterProgressSchema.index({ primarySessionId: 1 });

export const ChapterProgress =
  mongoose.models.ChapterProgress ||
  mongoose.model('ChapterProgress', chapterProgressSchema);
```

**Important MongoDB operators to use when writing:**
```js
// ALWAYS use $addToSet for completedTopicIds — prevents duplicates even on concurrent writes
{ $addToSet: { completedTopicIds: topicId } }

// ALWAYS use $inc for counters — atomic, no race conditions
{ $inc: { totalMessagesExchanged: 1 } }

// ALWAYS use $set for pointer updates — last-write-wins (acceptable for single-user sessions)
{ $set: { currentTopicId: nextTopicId, progressPercent: newPercent } }
```

---

### 3.3 — `study_events` Collection (Analytics + Audit)

**Purpose:** Append-only event log. Write-cheap, read-rarely. Power for future analytics.  
**Rule:** NEVER update a study_event doc. Only insert. It's a log, not a state store.

```js
// backend/src/models/studyEvent.model.js

import mongoose from 'mongoose';

const studyEventSchema = new mongoose.Schema(
  {
    userId:    { type: String, default: null, index: true },
    guestId:   { type: String, default: null },
    sessionId: { type: String, required: true },
    chapterId: { type: String, required: true },
    topicId:   { type: String, default: null },

    eventType: {
      type: String,
      required: true,
      enum: [
        'chapter_started',      // first time student enters a chapter
        'chapter_resumed',      // student returns to a previously started chapter
        'chapter_completed',    // all core topics done via NEXT_STEP
        'topic_started',        // NEXT_STEP advances to this topic
        'topic_completed',      // NEXT_STEP marks previous topic as done
        'topic_skipped',        // future: student explicitly skips
        'doubt_asked',          // CONCEPT_QUESTION intent fired in this chapter
        'explanation_requested',// EXPLAIN_MORE intent fired
        'session_started',      // new session for this chapter begins
        'session_exhausted',    // token limit hit during chapter study
        'chapter_restarted',    // student chose "start over"
      ],
    },

    // event-specific extra data — use sparingly, keep flat
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // for time-based queries and future partitioning
    dayBucket: { type: String, default: null }, // '2026-06-28' (UTC)
  },
  {
    timestamps: true,
    collection: 'study_events',
  }
);

// Read paths
studyEventSchema.index({ userId: 1, createdAt: -1 });
studyEventSchema.index({ userId: 1, dayBucket: 1 });  // streak calc
studyEventSchema.index({ chapterId: 1, eventType: 1 }); // aggregate analytics

// Optional TTL — uncomment to auto-delete events older than 1 year
// studyEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const StudyEvent =
  mongoose.models.StudyEvent ||
  mongoose.model('StudyEvent', studyEventSchema);
```

---

### 3.4 — `user_study_stats` Collection (Materialized Aggregates)

**Purpose:** Pre-computed stats for fast reads. Updated on key events, not on every query.  
**Rule:** Never compute streak or coverage live — always read from this collection.

```js
// backend/src/models/userStudyStats.model.js

import mongoose from 'mongoose';

const subjectCoverageSchema = new mongoose.Schema({
  chaptersStarted:   { type: Number, default: 0 },
  chaptersCompleted: { type: Number, default: 0 },
  totalChapters:     { type: Number, default: 0 },
  progressPercent:   { type: Number, default: 0 },
}, { _id: false });

const userStudyStatsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },

    // ─── Quick Resume ────────────────────────────────────────
    lastStudiedChapterId:  { type: String, default: null },
    lastStudiedTopicId:    { type: String, default: null },
    lastStudiedSessionId:  { type: String, default: null },
    lastStudiedAt:         { type: Date,   default: null },

    // ─── Streak (future Phase 5) ─────────────────────────────
    currentStreakDays: { type: Number, default: 0 },
    longestStreakDays: { type: Number, default: 0 },
    lastStudyDate:     { type: String, default: null }, // 'YYYY-MM-DD' UTC

    // ─── Totals ──────────────────────────────────────────────
    totalStudyTimeSec:       { type: Number, default: 0 },
    totalSessionsCount:      { type: Number, default: 0 },
    totalMessagesExchanged:  { type: Number, default: 0 },

    // ─── Subject Coverage ────────────────────────────────────
    syllabusCoverage: {
      physics:    { type: subjectCoverageSchema, default: () => ({}) },
      chemistry:  { type: subjectCoverageSchema, default: () => ({}) },
      biology:    { type: subjectCoverageSchema, default: () => ({}) },
    },
  },
  {
    timestamps: true,
    collection: 'user_study_stats',
  }
);

export const UserStudyStats =
  mongoose.models.UserStudyStats ||
  mongoose.model('UserStudyStats', userStudyStatsSchema);
```

---

### 3.5 — Modifications to Existing Collections

#### `chat_sessions` — Add 2 optional fields
```js
// Add to chatSessionSchema (additive — no migration needed):

chapterProgressId: {
  type:    mongoose.Schema.Types.ObjectId,
  ref:     'ChapterProgress',
  default: null,
  index:   true,
},

// Snapshot of chapter data for the sidebar (avoids join on session list query)
focusChapterSnapshot: {
  chapterId:     { type: String, default: null },
  chapterTitle:  { type: String, default: null },  // English title
  hinglishTitle: { type: String, default: null },  // from CHAPTER_HINGLISH map
  subjectId:     { type: String, default: null },
  sectionId:     { type: String, default: null },
},
```

#### `chat_history.messages[]` — Add `suggestedActions` field
**CRITICAL BUG (currently missing):** On page refresh, `suggestedActions` (action chips under Zuno's last message) are lost because `chatHistory.messages[]` has no `suggestedActions` field. The backend response carries them but they're never saved to DB.

```js
// In chatHistory.model.js, inside messagesSchema:
suggestedActions: {
  type: [
    {
      type:  { type: String, maxlength: 60 },
      label: { type: String, maxlength: 80 },
      _id:   false,
    }
  ],
  default: [],
},
```

Then in `step7.saveAndRespond.js` line 357 (the `addChatMessages` call for the 'tutor' message), add:
```js
{
  role: 'tutor',
  text: answerPayload.answer,
  action: answerPayload.intent,
  sources,
  suggestedActions: answerPayload.suggestedActions || [], // ← ADD THIS
  metadata: { ... },
}
```

And in `session.controller.js` `getSessionHistory`, when converting DB messages to frontend format, include `suggestedActions`:
```js
suggestedActions: msg.suggestedActions || [],
```

---

### 3.6 — Collection Relationships (Entity Map)

```
┌──────────────────────────────────────────────────────────────────┐
│                         COLLECTIONS MAP                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐          ┌──────────────────┐                    │
│   │  users   │──1:N────►│  chat_sessions   │                    │
│   │          │          │                  │                    │
│   │ userId   │          │ sessionId (PK)   │                    │
│   │          │          │ userId (FK)      │                    │
│   └─────┬────┘          │ sessionType      │                    │
│         │               │ chatState{       │                    │
│         │               │  currentChapterId│                    │
│         │               │  completedTopicIds│                   │
│         │               │ }                │                    │
│         │               │ chapterProgressId│──────┐             │
│         │               └──────────┬───────┘      │             │
│         │                          │ 1:N           │ FK          │
│         │                          ▼               ▼             │
│         │               ┌──────────────────┐ ┌───────────────┐  │
│         │               │  chat_history    │ │chapter_progress│  │
│         │               │                  │ │               │  │
│         │               │ sessionId (FK)   │ │ userId (FK)   │  │
│         │               │ messages[]{      │ │ chapterId     │  │
│         │               │  role, text,     │ │ status        │  │
│         │               │  sources,        │ │ currentTopicId│  │
│         │               │  suggestedActions│ │ completedTopicIds│
│         │               │ }                │ │ progressPercent│  │
│         │               └──────────────────┘ │ topicEngagement│  │
│         │                                    └───────┬────────┘  │
│         │                                            │ 1:N        │
│         │                                            ▼            │
│         │                                    ┌───────────────┐   │
│         │1:1                                  │ study_events  │   │
│         ▼                                    │               │   │
│   ┌─────────────────┐                        │ userId (FK)   │   │
│   │ user_study_stats│                        │ sessionId (FK)│   │
│   │                 │                        │ chapterId (FK)│   │
│   │ userId (1:1)    │                        │ eventType     │   │
│   │ lastStudied..   │                        │ timestamp     │   │
│   │ streak, totals  │                        └───────────────┘   │
│   └─────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

**Key relationship rules:**
1. `chapter_progress` is the cross-session truth store — it survives session expiry
2. `chat_sessions.chatState.completedTopicIds` mirrors `chapter_progress.completedTopicIds` for the CURRENT session (read from DB, then kept in-sync via step7)
3. `study_events` is write-only from the app layer — never read in the hot path
4. `user_study_stats` is the read cache for the "quick resume" experience

---

## 4. SERVICE LAYER

### 4.1 — `chapterProgress.service.js` (New File)

**File path:** `backend/src/services/chapterProgress.service.js`

```js
import { ChapterProgress } from '../models/chapterProgress.model.js';
import { StudyEvent }      from '../models/studyEvent.model.js';
import redis               from '../config/redisClient.js';

const CACHE_TTL_SEC = 60; // 1 minute — invalidated on every /ask write

// ─── Cache key builders ────────────────────────────────────────────────────
const progressCacheKey  = (userId, chapterId) => `cp:${userId}:${chapterId}`;
const listCacheKey      = (userId) => `cp_list:${userId}`;

// ─── READ: Get chapter progress (with Redis cache) ──────────────────────────
export const getChapterProgress = async (userId, guestId, chapterId) => {
  const cacheKey = progressCacheKey(userId || guestId, chapterId);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss is fine — continue to DB */ }

  const query = userId
    ? { userId, chapterId }
    : { guestId, chapterId };

  const doc = await ChapterProgress.findOne(query).lean();

  if (doc) {
    try { await redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(doc)); } catch {}
  }

  return doc; // null if not found (first time student opens this chapter)
};

// ─── READ: List user's chapters by status ───────────────────────────────────
export const listUserChapterProgress = async (userId, { status, limit = 10 } = {}) => {
  const query = { userId };
  if (status) query.status = status;

  return ChapterProgress
    .find(query)
    .sort({ lastStudiedAt: -1 })
    .limit(limit)
    .lean();
};

// ─── WRITE: Upsert — creates on first access, updates on subsequent ──────────
// Called from Step 7 on every focus mode /ask response.
export const upsertChapterProgress = async (userId, guestId, chapterId, updates) => {
  const filter = userId
    ? { userId, chapterId }
    : { guestId, chapterId };

  // Compute progressPercent before write if we know total topics
  const docBefore = await ChapterProgress.findOne(filter).lean();
  const totalTopics = updates.totalCoreTopics || docBefore?.totalCoreTopics || 0;
  const completedCount = (updates.completedTopicIds || docBefore?.completedTopicIds || []).length;
  const progressPercent = totalTopics > 0
    ? Math.round((completedCount / totalTopics) * 100)
    : 0;

  const setFields = {
    ...updates,
    progressPercent,
    lastStudiedAt: new Date(),
  };

  // $addToSet for completedTopicIds — prevents duplicates even on concurrent writes
  const arrayUpdates = {};
  if (updates.completedTopicIds?.length) {
    arrayUpdates.$addToSet = { completedTopicIds: { $each: updates.completedTopicIds } };
    delete setFields.completedTopicIds; // handled by $addToSet, not $set
  }

  if (updates.linkedSessionId) {
    arrayUpdates.$addToSet = { ...arrayUpdates.$addToSet, linkedSessionIds: updates.linkedSessionId };
    delete setFields.linkedSessionId;
  }

  const doc = await ChapterProgress.findOneAndUpdate(
    filter,
    {
      $set: setFields,
      $setOnInsert: {
        userId:    userId || null,
        guestId:   guestId || null,
        chapterId,
        startedAt: new Date(),
      },
      ...arrayUpdates,
    },
    { upsert: true, returnDocument: 'after', new: true }
  );

  // Invalidate cache on write
  const cacheKey = progressCacheKey(userId || guestId, chapterId);
  try { await redis.del(cacheKey, listCacheKey(userId)); } catch {}

  return doc;
};

// ─── WRITE: Mark chapter as completed ───────────────────────────────────────
// Called from Step 7 when nextTopicSignal returns chapter_complete status.
export const markChapterComplete = async (userId, guestId, chapterId) => {
  return ChapterProgress.findOneAndUpdate(
    userId ? { userId, chapterId } : { guestId, chapterId },
    {
      $set: {
        status:       'completed',
        progressPercent: 100,
        completedAt:  new Date(),
        lastStudiedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
};

// ─── WRITE: Reset chapter (student chose "Start Over") ──────────────────────
export const resetChapterProgress = async (userId, chapterId) => {
  return ChapterProgress.findOneAndUpdate(
    { userId, chapterId },
    {
      $set: {
        status:           'in_progress',
        currentTopicId:   null,
        completedTopicIds: [],
        progressPercent:  0,
        completedAt:      null,
        lastStudiedAt:    new Date(),
      },
    },
    { returnDocument: 'after' }
  );
};

// ─── WRITE: Log a study event (fire-and-forget — never awaited in hot path) ──
export const logStudyEvent = (userId, guestId, sessionId, chapterId, eventType, metadata = {}) => {
  const dayBucket = new Date().toISOString().slice(0, 10); // '2026-06-28'
  StudyEvent.create({
    userId: userId || null,
    guestId: guestId || null,
    sessionId,
    chapterId,
    topicId: metadata.topicId || null,
    eventType,
    metadata,
    dayBucket,
  }).catch((err) => console.error('[StudyEvent] Failed to log event (non-critical):', err.message));
  // No await — fire and forget. Study events must NEVER slow down /ask.
};
```

---

## 5. API ENDPOINTS

### 5.1 — New Route File

**File path:** `backend/src/routes/chapterProgress.routes.js`

```js
import { Router } from 'express';
import {
  getChapterProgressController,
  listChapterProgressController,
  chapterActionController,
} from '../controllers/chapterProgress.controller.js';

const router = Router();

router.get('/:chapterId',   getChapterProgressController);   // single chapter progress
router.get('/',             listChapterProgressController);  // list user's progress
router.post('/:chapterId/action', chapterActionController); // reset / skip

export default router;
```

Register in `app.js`:
```js
import chapterProgressRoutes from './routes/chapterProgress.routes.js';
app.use('/api/v1/chapter-progress', chapterProgressRoutes);
```

---

### 5.2 — `GET /api/v1/chapter-progress/:chapterId`

**When called:** FocusModal chapter select → frontend fetches progress before showing chat.  
**Also called:** ChatPage initial load for active focus session.

**Request:**
```
GET /api/v1/chapter-progress/science.physics.chapter-03
Headers: (optional) X-User-Id: "user_abc123"
         (optional) X-Guest-Id: "guest_xyz789"
```

**Response (chapter not started yet — 200, data null):**
```json
{
  "data": {
    "progress": null,
    "topics": [
      { "topicId": "science.physics.chapter-03.topic-01", "title": "1. Electric Current", "order": 1 },
      { "topicId": "science.physics.chapter-03.topic-02", "title": "2. Ohm's Law", "order": 2 }
    ],
    "totalTopics": 8,
    "recommendation": {
      "action": "start",
      "message": "Chalo shuru karte hain! Pehla topic hai 'Electric Current'.",
      "chips": [
        { "type": "next_step", "label": "Shuru karo" },
        { "type": "chapter_overview", "label": "Pehle overview do" }
      ]
    }
  }
}
```

**Response (chapter in progress — 200):**
```json
{
  "data": {
    "progress": {
      "chapterId": "science.physics.chapter-03",
      "status": "in_progress",
      "progressPercent": 37,
      "currentTopicId": "science.physics.chapter-03.topic-04",
      "completedTopicIds": ["topic-01", "topic-02", "topic-03"],
      "totalCoreTopics": 8,
      "lastStudiedAt": "2026-06-27T14:23:11.000Z",
      "totalTimeSpentSec": 1840,
      "totalDoubtsAsked": 3
    },
    "topics": [ ... ],
    "recommendation": {
      "action": "resume",
      "message": "Wapas aaye! Topic 4 — 'Current Electricity' tak pahuche the. Wahan se chalein?",
      "chips": [
        { "type": "next_step",    "label": "Haan, wahan se chalein" },
        { "type": "topic_1",      "label": "Topic 1 se fresh shuru" },
        { "type": "roadmap",      "label": "Roadmap dikhao" }
      ]
    }
  }
}
```

**Response (chapter completed — 200):**
```json
{
  "data": {
    "progress": {
      "status": "completed",
      "progressPercent": 100,
      "completedAt": "2026-06-26T18:00:00.000Z"
    },
    "recommendation": {
      "action": "revise",
      "message": "Yeh chapter tune pehle complete kar liya hai! Revision karein ya agla chapter?",
      "chips": [
        { "type": "revise",       "label": "Revision karo" },
        { "type": "next_chapter", "label": "Agla chapter" }
      ]
    }
  }
}
```

---

### 5.3 — `GET /api/v1/chapter-progress` (List)

**When called:** FocusModal opens — show "Continue" section at the top.

**Request:**
```
GET /api/v1/chapter-progress?status=in_progress&limit=5
```

**Response:**
```json
{
  "data": {
    "chapters": [
      {
        "chapterId": "science.physics.chapter-03",
        "hinglishTitle": "Bijli",
        "status": "in_progress",
        "progressPercent": 37,
        "currentTopicTitle": "3. Current Electricity",
        "completedCount": 3,
        "totalCount": 8,
        "lastStudiedAt": "2026-06-27T14:23:11.000Z"
      }
    ],
    "summary": {
      "inProgressCount": 2,
      "completedCount": 1,
      "notStartedCount": 13
    }
  }
}
```

---

### 5.4 — `POST /api/v1/chapter-progress/:chapterId/action`

**When called:** Student explicitly resets chapter or skips a topic.

**Request body:**
```json
{ "action": "reset" }
// OR
{ "action": "skip_topic", "topicId": "science.physics.chapter-03.topic-02" }
// OR
{ "action": "mark_revising" }
```

**Response:** `{ "data": { "progress": { ...updated doc } } }`

---

### 5.5 — Modified `/ask` Response — New Fields

**In `step7.buildSessionPayload()`**, add to the returned object:
```js
completedTopicIds: chatState.completedTopicIds || [],
currentTopicId:    chatState.currentTopicId || null,
// already planned in FOCUS_MODE_MASTER_PLAN STEP-2
```

**In `step7.saveAndRespond()` response payload**, add a new top-level key:
```js
chapterProgress: chapterProgressDoc ? {
  progressPercent:    chapterProgressDoc.progressPercent,
  currentTopicId:     chapterProgressDoc.currentTopicId,
  completedTopicIds:  chapterProgressDoc.completedTopicIds,
  totalCoreTopics:    chapterProgressDoc.totalCoreTopics,
  isChapterComplete:  chapterProgressDoc.status === 'completed',
  lastStudiedAt:      chapterProgressDoc.lastStudiedAt,
} : null,
```

Frontend reads `response.chapterProgress` and updates `FocusProgressHeader` immediately — no extra API call needed.

---

## 6. BACKEND PIPELINE CHANGES

### 6.1 — Step 2: Load Chapter Progress

**File:** `backend/src/ask/step2.loadSession.js`

After the existing session load (line 93), add:

```js
// Load cross-session chapter progress for focus mode
let chapterProgress = null;
if (studyMode === 'focus' && focusChapter?.id) {
  chapterProgress = await getChapterProgress(userId, guestId, focusChapter.id);

  // If we have cross-session progress, sync it into chatState for this session
  // This handles: student starts new session after old one exhausted
  if (chapterProgress && chatState.isNewSession) {
    chatState.currentTopicId    = chapterProgress.currentTopicId;
    chatState.completedTopicIds = chapterProgress.completedTopicIds || [];
    if (isDev) console.log(`[Step 2] Synced chapter progress from DB → currentTopicId: ${chapterProgress.currentTopicId}`);
  }
}

return { sessionId, chatState, recentMessages, chapterProgress };
```

**Why sync into chatState on new session?**  
`getNextTopic()` in Step 5 reads `chatState.currentTopicId` to know where to resume. Without syncing from `chapter_progress`, new sessions always start from Topic 1 even if student completed 6 topics in prior sessions.

---

### 6.2 — Step 7: Write Chapter Progress

**File:** `backend/src/ask/step7.saveAndRespond.js`

Add after the existing `updateChatSession()` call (after line 250):

```js
// ─── Write cross-session chapter progress ─────────────────────────────────
// Fire-and-forget for non-critical engagement fields.
// Only await when chapter is completed (critical state change).
let chapterProgressDoc = null;

if (studyMode === 'focus' && chatState.currentChapterId) {
  const chapterId = chatState.currentChapterId;
  const completedNow = stateUpdates.completedTopicIds || chatState.completedTopicIds || [];

  const progressUpdates = {
    currentTopicId:    stateUpdates.currentTopicId ?? chatState.currentTopicId,
    completedTopicIds: completedNow,
    primarySessionId:  sessionId,
    linkedSessionId:   sessionId,
    subjectId:         chatState.currentSubjectId,
    sectionId:         chatState.currentSectionId,
    chapterTitle:      focusChapter?.title || null,
  };

  // Detect CHAPTER_COMPLETE (topic pointer returned null after exhausting all topics)
  const isChapterComplete = (
    decision?.intent === 'NEXT_STEP' &&
    nextTopicSignal?.status === 'chapter_complete'  // set by intentRouter/nextTopicResolver
  );

  if (isChapterComplete) {
    // SYNCHRONOUS — chapter completion is a critical milestone
    chapterProgressDoc = await markChapterComplete(userId, guestId, chapterId);
    logStudyEvent(userId, guestId, sessionId, chapterId, 'chapter_completed');
  } else {
    // ASYNC fire-and-forget — never block /ask for engagement updates
    chapterProgressDoc = await upsertChapterProgress(userId, guestId, chapterId, progressUpdates);
    if (nextTopicSignal) {
      logStudyEvent(userId, guestId, sessionId, chapterId, 'topic_completed', {
        topicId: chatState.currentTopicId,
        nextTopicId: nextTopicSignal.topicId,
      });
    }
    if (decision?.intent === 'CONCEPT_QUESTION') {
      // Fire-and-forget doubt counter increment
      ChapterProgress.findOneAndUpdate(
        userId ? { userId, chapterId } : { guestId, chapterId },
        { $inc: { totalDoubtsAsked: 1, 'totalMessagesExchanged': 1 } }
      ).catch(() => {});
    }
  }
}
```

---

### 6.3 — intentRouter.js: CHAPTER_COMPLETE Recovery

**File:** `backend/src/ask/intentRouter.js`  
**Problem from FOCUS_MODE_MASTER_PLAN.md STEP-4:** After CHAPTER_COMPLETE, student is stuck — empty suggestedActions, no way forward.

Update the CHAPTER_COMPLETE handler:

```js
if (retrieval.retrievedContext === 'CHAPTER_COMPLETE') {
  return {
    status:       'answered',
    responseMode: 'study_tutor',
    title:        'Chapter Complete!',
    sections: [{
      heading: '',
      content: `🎉 Bahut badiya! Iss chapter ke saare core topics cover ho gaye! 
Tumne ek puri chapter padh li — yeh badi baat hai. 
Ab tum revision kar sakte ho ya agla chapter shuru kar sakte ho.`,
    }],
    suggestedActions: [
      { type: 'switch_chapter', label: 'Agla chapter shuru karo' },
      { type: 'revise_chapter', label: 'Yeh chapter revise karo' },
      { type: 'global_mode',    label: 'Koi bhi sawaal poochho' },
    ],
    memoryUpdate: {},
    tokenUsage:   0,
  };
}
```

Frontend `handleSuggestedAction` must handle:
- `switch_chapter` → open FocusModal
- `revise_chapter` → call POST /chapter-progress/:id/action { action: 'mark_revising' }
- `global_mode` → setStudyMode(STUDY_MODES.global)

---

## 7. FRONTEND ARCHITECTURE

### 7.1 — New Hook: `useChapterProgress.js`

**File path:** `frontend/src/hooks/useChapterProgress.js`

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchChapterProgress } from '../api/tutorApi.js';

// In-memory cache — keyed by chapterId
// TTL 30s — stale after /ask response anyway (invalidated by custom event)
const cache = new Map();
const TTL_MS = 30_000;

export function useChapterProgress(chapterId) {
  const [data, setData]       = useState(null);   // { progress, topics, recommendation }
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState(null);
  const mountedRef = useRef(true);

  const invalidate = useCallback(() => {
    cache.delete(chapterId);
  }, [chapterId]);

  const fetch = useCallback(async () => {
    if (!chapterId) return;

    // Check cache first
    const cached = cache.get(chapterId);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setData(cached.data);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchChapterProgress(chapterId);
      if (!mountedRef.current) return;
      const dataToCache = result?.data ?? null;
      cache.set(chapterId, { data: dataToCache, ts: Date.now() });
      setData(dataToCache);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
      console.warn('[useChapterProgress] Fetch failed — showing stale or null data:', err.message);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => { mountedRef.current = false; };
  }, [fetch]);

  // Listen for cache invalidation from ChatPage (after /ask completes)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.chapterId === chapterId) {
        invalidate();
        fetch();
      }
    };
    window.addEventListener('chapter-progress-changed', handler);
    return () => window.removeEventListener('chapter-progress-changed', handler);
  }, [chapterId, invalidate, fetch]);

  return { data, isLoading, error, refetch: fetch };
}
```

After every `/ask` response in `ChatPage.jsx`:
```js
// Invalidate chapter progress cache after response
if (studyMode === STUDY_MODES.focus && selectedChapterId) {
  window.dispatchEvent(
    new CustomEvent('chapter-progress-changed', { detail: { chapterId: selectedChapterId } })
  );
}
```

---

### 7.2 — New API Function in `tutorApi.js`

```js
export const fetchChapterProgress = async (chapterId) => {
  const res = await fetch(`${API_BASE}/api/v1/chapter-progress/${chapterId}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 404) return { data: null }; // not found = not started
    throw new Error(`chapter-progress fetch failed: ${res.status}`);
  }
  return res.json();
};

export const listChapterProgress = async ({ status, limit = 10 } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit)  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/api/v1/chapter-progress?${params}`);
  if (!res.ok) throw new Error(`chapter-progress list failed: ${res.status}`);
  return res.json();
};
```

---

### 7.3 — FocusModal — "Continue" Section

**File:** `frontend/src/components/FocusModal.jsx`

Add a "Continue" section at the top when `inProgressChapters` is not empty:

```jsx
// State (in FocusModal or parent ChatPage):
const [inProgressChapters, setInProgressChapters] = useState([]);

// Load on modal open:
useEffect(() => {
  if (open) {
    listChapterProgress({ status: 'in_progress', limit: 5 })
      .then(r => setInProgressChapters(r?.data?.chapters || []))
      .catch(() => {}); // non-critical — modal still works
  }
}, [open]);

// Render above the subject list:
{inProgressChapters.length > 0 && (
  <Box sx={{ mb: 2 }}>
    <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
      Continue Karo
    </Typography>
    {inProgressChapters.map(ch => (
      <Button key={ch.chapterId} onClick={() => handleChapterSelect(ch.chapterId)} sx={{ /* styles */ }}>
        <Box>
          <Typography variant="body2">{ch.hinglishTitle || ch.chapterTitle}</Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
            {ch.completedCount}/{ch.totalCount} topics • {ch.progressPercent}% done
          </Typography>
        </Box>
        <LinearProgress value={ch.progressPercent} variant="determinate" sx={{ width: 60, ml: 'auto' }} />
      </Button>
    ))}
  </Box>
)}
```

---

### 7.4 — ChatPage.jsx — Smart Welcome Logic

**File:** `frontend/src/pages/ChatPage.jsx`

In `handleFocusChapterSelect` (when student picks a chapter from FocusModal):

```js
const handleFocusChapterSelect = async (chapter) => {
  setSelectedChapterId(chapter.id);
  setStudyMode(STUDY_MODES.focus);
  closeFocusModal();

  // Fetch cross-session progress to build context-aware welcome
  let resumeContext = null;
  try {
    const result = await fetchChapterProgress(chapter.id);
    resumeContext = result?.data;
  } catch { /* non-critical — welcome will be generic */ }

  const progress = resumeContext?.progress;
  const recommendation = resumeContext?.recommendation;

  if (progress && progress.status === 'in_progress' && progress.currentTopicId) {
    // RETURNING STUDENT — offer choice
    const hinglishTitle = CHAPTER_HINGLISH[chapter.title] || chapter.title;
    addSystemMessage(`"${hinglishTitle}" mein wapas aaye! 
${progress.progressPercent}% complete kar chuke ho.`);

    // Show recommendation chips instead of auto-ask
    if (recommendation?.chips?.length) {
      addSmartChips(recommendation.chips); // renders below system message
    }
  } else if (progress?.status === 'completed') {
    // CHAPTER ALREADY DONE
    addSystemMessage(`${CHAPTER_HINGLISH[chapter.title] || chapter.title} pehle complete kar chuke ho! 🎉`);
    addSmartChips([
      { type: 'revise_chapter', label: 'Revision karo' },
      { type: 'switch_chapter', label: 'Naya chapter chuno' },
    ]);
  } else {
    // FRESH START — auto-ask
    await handleAsk('Shuru karo', STUDY_MODES.focus);
  }
};
```

---

### 7.5 — State Additions to ChatPage.jsx

```js
// ADD to existing useState declarations:
const [chapterProgressPercent, setChapterProgressPercent] = useState(0);

// UPDATE after every /ask response:
if (payload?.chapterProgress) {
  setChapterProgressPercent(payload.chapterProgress.progressPercent);
  setCompletedTopicIds(payload.chapterProgress.completedTopicIds || []);
  setCurrentTopicId(payload.chapterProgress.currentTopicId ?? null);
  window.dispatchEvent(new CustomEvent('chapter-progress-changed', { detail: { chapterId: selectedChapterId } }));
}
```

---

### 7.6 — Topbar — Hinglish Chapter Name

**File:** Wherever the chapter name displays in `Topbar.jsx` (or wherever `selectedChapter` is shown):

```jsx
import { CHAPTER_HINGLISH } from '../constants/chapterHinglish.js';

// In the chapter pill display:
const displayChapterName = selectedChapter
  ? (CHAPTER_HINGLISH[selectedChapter.title] || selectedChapter.title)
  : null;
```

---

### 7.7 — Token Limit Warning Banner

**When:** `totalTokensUsed > (SESSION_TOKEN_LIMIT * 0.85)` — show warning 15% before limit.

```jsx
// In ChatPage.jsx, below AskBar:
{studyMode === STUDY_MODES.focus && sessionTotalTokens > TOKEN_WARNING_THRESHOLD && !isSessionLocked && (
  <Box sx={{
    bgcolor: 'rgba(255, 152, 0, 0.1)',
    border: '1px solid rgba(255, 152, 0, 0.3)',
    borderRadius: 'var(--radius)',
    p: 1.5, textAlign: 'center',
    mx: 'auto', maxWidth: 'var(--chat-max-width)',
    mb: 1,
  }}>
    <Typography variant="caption" sx={{ color: '#FF9800' }}>
      ⚡ Yeh chat session khatam hone wali hai (token limit). 
      Tumhara progress save hai — naya chat kholo aur same chapter select karo.
    </Typography>
  </Box>
)}
```

---

## 8. CACHING STRATEGY (Complete)

| Cache Layer | What | Key Format | TTL | Invalidated When |
|------------|------|-----------|-----|-----------------|
| Redis | Single chapter progress | `cp:{userId}:{chapterId}` | 60s | Every /ask write in that chapter |
| Redis | Chapter list (in-progress) | `cp_list:{userId}` | 60s | Every /ask write |
| Redis | Study map (static) | `study_map:v1` | 24h | Manual (curriculum change) |
| Redis | Guest turn count | `guest_turns:{guestId}` | 30d | Never (TTL-based expiry) |
| Frontend | Chapter progress | Map keyed by chapterId | 30s | CustomEvent from /ask response |
| Frontend | Topics list | useState per chapterId | session | Page reload |
| HTTP | GET /study-map | Cache-Control max-age=3600 | 1h | Server restart |
| HTTP | GET /chapter-progress | no-cache | — | Always fresh (uses Redis internally) |

**What NOT to cache:**
- `/ask` responses — always fresh, always from DB
- `chat_history` messages — refresh-sensitive, always from DB
- Session state — must be consistent, use DB directly

**Redis key naming convention:** `{entity_prefix}:{scope}:{id}` — always lowercase, colon-separated.

---

## 9. ALL SCENARIOS (End-to-End Traces)

### Scenario 1: First-Time Student, New Chapter

```
1. Student opens FocusModal
2. Frontend: listChapterProgress() → []  (no in-progress chapters yet)
3. FocusModal: no "Continue" section visible
4. Student selects Electricity (chapter-03)
5. Frontend: fetchChapterProgress('science.physics.chapter-03') → { data: null }
6. progress = null → "FRESH START" path
7. handleFocusChapterSelect → calls handleAsk('Shuru karo', 'focus')
8. Backend: Step2 loads session, chapterProgress = null (first time)
9. Step4: intent = NEXT_STEP (detected from 'Shuru karo')
10. Step5: getNextTopic(chapter-03, null) → Topic 1 — "Electric Current"
11. Step7:
    - updateChatSession (chatState.currentTopicId = 'topic-01')
    - upsertChapterProgress (CREATE: { chapterId, currentTopicId: 'topic-01', completedTopicIds: [] })
    - logStudyEvent('chapter_started')
12. Response: "Electricity ka pehla topic hai 'Electric Current'..." + chips
13. FocusProgressHeader: "Topic 1 of 8 • 0%"
```

---

### Scenario 2: Returning Student — Mid-Chapter Resume

```
1. Student opens FocusModal
2. Frontend: listChapterProgress({status:'in_progress'}) → [{ chapterId:'chapter-03', progressPercent:37, completedCount:3 }]
3. FocusModal: "Continue Karo" section shows "Electricity • 3/8 topics"
4. Student clicks "Electricity"
5. Frontend: fetchChapterProgress('chapter-03') →
   { progress: { currentTopicId:'topic-04', progressPercent:37 },
     recommendation: { action:'resume', message:'Topic 4 se chalein?', chips:[...] } }
6. "RETURNING STUDENT" path — show system message + recommendation chips
7. Student clicks "Haan, wahan se chalein" chip
8. handleAsk fires with 'Haan, wahan se chalein'
9. Backend: Step2 loads session
   - chatState.isNewSession = true (new session after old one exhausted)
   - chapterProgress.currentTopicId = 'topic-04'
   - SYNC: chatState.currentTopicId = 'topic-04', completedTopicIds = ['topic-01','topic-02','topic-03']
10. Step4: intent = NEXT_STEP
11. Step5: getNextTopic('chapter-03', 'topic-04') → Topic 5 — "Resistors in Series"
12. Zuno teaches Topic 5
13. FocusProgressHeader: "Topic 5 of 8 • 50%"  ← jumps directly to correct position
```

---

### Scenario 3: Session Token Limit Hit Mid-Chapter

```
1. Student studying Electricity, Topic 6. Session at 30,000 tokens.
2. Backend response: { session: { totalTokensUsed: 30500 } }
3. Frontend: 30500 > TOKEN_WARNING_THRESHOLD (0.85 × 35000 = 29750)
4. Warning banner appears: "Yeh chat session khatam hone wali hai..."
5. Student continues — 3 more turns
6. Session hits 35,000 → status = 'exhausted' → isLocked = true
7. Frontend: AskBar disabled, shows "Session khatam ho gai. Naya chat lo — progress save hai."
8. Student clicks "New Chat" button in SessionBar
9. New session created (blank chatState)
10. Student opens FocusModal → "Continue Karo" shows Electricity at 75%
11. Student clicks → Smart Welcome: "Topic 7 se continue karein?"
12. New session loads chapter_progress → syncs completedTopicIds into fresh chatState
13. Student continues from exactly where they left off ✓
```

---

### Scenario 4: Chapter Switch Mid-Session

```
1. Student studying Electricity (chapter-03), Topic 3.
   chatState: { currentChapterId:'chapter-03', currentTopicId:'topic-03', completedTopicIds:['topic-01','topic-02'] }
2. Student opens FocusModal → selects "Light" (chapter-01)
3. handleFocusChapterSelect('chapter-01'):
   - fetchChapterProgress('chapter-01') → null (not started)
   - setSelectedChapterId('chapter-01')
4. Next /ask: focusChapter = { id:'chapter-01' }
5. Step2:
   - isChapterSwitch = ('chapter-03' !== 'chapter-01') → TRUE
   - chatState.currentChapterId = 'chapter-01'
   - chatState.currentTopicId = null  ← RESET (STEP-3 fix from master plan)
   - chatState.completedTopicIds = [] ← But chapter_progress for chapter-01 is fetched
   - chapterProgress for chapter-01 = null → completedTopicIds stays []
6. Step5: getNextTopic('chapter-01', null) → Topic 1 of Light
7. chapter_progress for chapter-03 is UNTOUCHED — Electricity progress preserved
8. chapter_progress for chapter-01 CREATED — starts fresh
```

---

### Scenario 5: Chapter Completion

```
1. Student on Topic 13 of 13 (Electricity last topic)
2. Student: "Aage badhao" → NEXT_STEP
3. Step5: getNextTopic('chapter-03', 'topic-13') → { status: 'chapter_complete' }
4. nextTopicSignal.status = 'chapter_complete'
5. intentRouter: CHAPTER_COMPLETE handler fires
6. Step7:
   - markChapterComplete(userId, guestId, 'chapter-03') [AWAITED — critical]
   - chapter_progress.status = 'completed', progressPercent = 100, completedAt = now()
   - logStudyEvent('chapter_completed')
7. Response: "🎉 Bahut badiya!" + chips: [Switch Chapter, Revise, Global Mode]
8. FocusProgressHeader: "Topic 13 of 13 • 100%" — progress bar full
9. FocusModal next time: Electricity shows ✅ "Completed" badge
```

---

### Scenario 6: Multi-Device / Concurrent Tabs

```
Device A (Mobile):  studying Electricity Topic 4
Device B (Laptop):  opens FocusModal

t=0: Mobile completes Topic 4 → chapter_progress updated:
     { currentTopicId:'topic-05', completedTopicIds:['topic-01'..'topic-04'], progressPercent:50 }

t=10s: Laptop opens FocusModal
     → listChapterProgress() → Redis cache 'cp_list:{userId}' → STALE (< 60s)
     → may show 37% instead of 50%

t=61s: Laptop opens FocusModal again
     → Redis cache expired → fresh DB read → shows 50% ✓

Acceptable: up to 60s of stale data across devices. For Bihar Board students (single-device use), this is fine.

Race condition protection:
  Both tabs send /ask simultaneously →
  $addToSet for completedTopicIds prevents duplicates ✓
  $inc for counters prevents lost updates ✓
  Last-write-wins on currentTopicId ($set) — acceptable for single-student use ✓
```

---

### Scenario 7: Guest User Progress

```
1. Guest visits site — no login
2. Backend generates guestId from localStorage: `guest_${randomUUID()}`
   Frontend stores in localStorage['zuno_guest_id']
   Sent as query param or header on every /ask
3. chapter_progress created with { guestId:'guest_abc123', userId:null }
4. Guest can resume progress in same browser (same guestId in localStorage)
5. Guest clears localStorage / opens incognito → guestId lost → progress lost (acceptable)

Guest-to-user migration (if login added later):
  On first login: findOneAndUpdate({ guestId, userId: null }, { $set: { userId: newUserId } })
  for all chapter_progress docs with that guestId.
  → Guest progress migrates to logged-in user ✓
```

---

### Scenario 8: Curriculum Update (New Topics Added)

```
1. Admin adds 2 new topics to Electricity → curriculum-index.json updated
2. chapter_progress docs have totalCoreTopics = 8, new curriculum has 10
3. On next GET /chapter-progress/chapter-03:
   - Backend reads new totalCoreTopics = 10 from curriculum-index
   - Compares with doc.totalCoreTopics = 8
   - Mismatch detected → recalculate progressPercent with new total
   - progressPercent = 3/10 = 30% (was 3/8 = 37%)
4. Response includes: { curriculumUpdated: true, message: '2 naye topics add hue hain' }
5. Frontend: shows banner "Iss chapter mein naye topics add hue hain"
6. completedTopicIds unchanged — student's existing completion preserved ✓
```

---

### Scenario 9: Student Asks Doubt Mid-NEXT_STEP Flow

```
1. Zuno teaching Topic 5 (just started)
2. Student asks: "Resistance ka formula kya hai?" (CONCEPT_QUESTION, not NEXT_STEP)
3. Intent = CONCEPT_QUESTION → no nextTopicSignal
4. Step7: no topic advancement, no $addToSet to completedTopicIds
5. chapter_progress: totalDoubtsAsked $inc +1 (fire-and-forget)
6. Zuno answers the doubt without advancing topic
7. Student can continue asking doubts or say "aage badhao" (NEXT_STEP)
   → Progress only advances on explicit NEXT_STEP, not on concept questions ✓
```

---

### Scenario 10: Student Double-Clicks "Aage Badhao" Chip

```
1. Student clicks chip → handleAsk fires
2. controllerRef.current = AbortController
3. isAsking = true → AskBar disabled
4. Student clicks again → handleAsk early-returns (isAsking guard)
5. Only ONE /ask request in flight → only one topic advancement ✓
6. chapter_progress updated exactly once ✓
```

---

### Scenario 11: suggestedActions Lost on Refresh (Fix)

```
BEFORE FIX:
1. Zuno responds with { answer: '...', suggestedActions: [{type:'next_step', label:'Aage badhein'}] }
2. Frontend renders action chip ✓
3. Student refreshes page (F5)
4. fetchSessionHistory() loads chat_history.messages[]
   → messages have no suggestedActions field
   → chips not restored ✗

AFTER FIX:
1. step7: addChatMessages() saves suggestedActions in tutor message
2. getSessionHistory(): message.suggestedActions included in response
3. ChatPage: convertDBMessage() maps suggestedActions: msg.suggestedActions || []
4. ChatMessage: renders chips from message.suggestedActions ✓
5. Student refreshes → chips are restored ✓
```

---

## 10. ERROR HANDLING & EDGE CASES

| Scenario | Detection | Recovery |
|----------|-----------|---------|
| chapter_progress fetch fails (network) | try/catch in getChapterProgress | Fallback to chatState values; log warning; don't block /ask |
| chapter_progress write fails | try/catch in upsertChapterProgress | Log error; /ask response still returns; session chatState has correct values |
| Redis unavailable | ioredis auto-retry (3 attempts) | Falls through to DB read; performance degraded, not broken |
| curriculumVersion mismatch | compare on read | Recalculate progressPercent with new total; set curriculumUpdated flag |
| topicId in completedTopicIds but not in current index | filter on read | Skip unknown topicIds; recompute percent |
| chapter_progress doc missing but session has progress | Step2 detects progress = null + session has completedTopicIds | Backfill: create chapter_progress from session chatState |
| NEXT_STEP fires but chapter not found | nextTopicResolver returns error | Fallback to CONCEPT_QUESTION path; log error |
| Student deletes account (future) | cascade delete hook | Soft-delete chapter_progress (isDeleted: true), hard-delete after 30 days |
| Unknown suggestedActions type | handleSuggestedAction default case | Use action.label as the question text (safe fallback) |
| LLM returns topicId not in curriculum | validate in nextTopicResolver | Ignore invalid topicId; return next valid topic |

---

## 11. IMPLEMENTATION PHASES

### PHASE 0 — Pre-Flight (30 min, no code change)
```
□ Verify FOCUS_MODE_MASTER_PLAN.md STEP-3 is done (currentTopicId reset on chapter switch)
  → Already in step2.loadSession.js (lines 78-80) ✓ (already implemented)
□ Verify FOCUS_MODE_MASTER_PLAN.md STEP-4 is open
  → intentRouter.js CHAPTER_COMPLETE empty suggestedActions — OPEN, fix in Phase 1
□ Verify Redis is running and connectRedis() passes
□ Back up chat_sessions collection (MongoDB Atlas → Download)
```

---

### PHASE 1 — Foundation (2-3 days) — BUILD THIS FIRST

**Files to create (in order):**
1. `backend/src/models/chapterProgress.model.js` — schema (Section 3.2)
2. `backend/src/models/studyEvent.model.js` — schema (Section 3.3)
3. `backend/src/services/chapterProgress.service.js` — service layer (Section 4.1)
4. `backend/src/controllers/chapterProgress.controller.js` — HTTP handlers
5. `backend/src/routes/chapterProgress.routes.js` — routes (Section 5.1)
6. Register routes in `backend/src/app.js`

**Files to modify (in order):**
7. `backend/src/models/chatSession.model.js` — add chapterProgressId + focusChapterSnapshot (Section 3.5)
8. `backend/src/models/chatHistory.model.js` — add suggestedActions to messages[] (Section 3.5)
9. `backend/src/ask/step2.loadSession.js` — load chapter progress, sync into chatState (Section 6.1)
10. `backend/src/ask/step7.saveAndRespond.js` — write chapter progress after session write (Section 6.2)
11. `backend/src/controllers/session.controller.js` — include suggestedActions in getSessionHistory response

**Test:**
```bash
# Create a focus session, ask 3 questions, verify chapter_progress doc created in MongoDB Atlas
# Exhaust session, create new session, verify Step2 syncs completedTopicIds from chapter_progress
npm run test:ask-db
```

---

### PHASE 2 — APIs (1-2 days)

**Create `chapterProgress.controller.js`:**
```js
// GET /:chapterId — getChapterProgressController
// GET /         — listChapterProgressController
// POST /:chapterId/action — chapterActionController
```

**Add to `tutorApi.js`:**
```js
fetchChapterProgress(chapterId)
listChapterProgress({ status, limit })
chapterProgressAction(chapterId, action, topicId)
```

**Test:**
```bash
# Test all endpoints with curl or Postman
# Verify Redis caching: second call returns cached result
# Verify invalidation: /ask clears cache, third call is fresh
curl http://localhost:5001/api/v1/chapter-progress/science.physics.chapter-03
```

---

### PHASE 3 — Frontend Resume UX (2 days)

**Files to create:**
1. `frontend/src/hooks/useChapterProgress.js` (Section 7.1)

**Files to modify:**
2. `frontend/src/api/tutorApi.js` — add fetchChapterProgress, listChapterProgress
3. `frontend/src/components/FocusModal.jsx` — add "Continue" section (Section 7.3)
4. `frontend/src/pages/ChatPage.jsx`:
   - Smart welcome logic in handleFocusChapterSelect (Section 7.4)
   - chapterProgressPercent state (Section 7.5)
   - CustomEvent dispatch after /ask (Section 7.1)
   - Token warning banner (Section 7.7)
5. `frontend/src/components/FocusProgressHeader.jsx` — show % next to "Topic X of Y"
6. Wherever chapter name shows in Topbar — use CHAPTER_HINGLISH (Section 7.6)

**Test in browser:**
- Select a new chapter → "Shuru karo" auto-fires ✓
- Ask 3 questions → progress bar moves ✓
- Refresh page → progress bar restored ✓
- Exhaust session → start new session → FocusModal shows "Continue" ✓
- Select in-progress chapter → smart welcome with correct topic number ✓

---

### PHASE 4 — CHAPTER_COMPLETE Fix (1 day)

**Files to modify:**
1. `backend/src/ask/intentRouter.js` — CHAPTER_COMPLETE handler with suggestedActions (Section 6.3)
2. `frontend/src/pages/ChatPage.jsx` — handleSuggestedAction: handle switch_chapter, revise_chapter, global_mode

**Test:**
- Complete all topics of a small chapter (one with few core topics)
- Verify: celebration message appears ✓
- Verify: "Agla chapter" chip opens FocusModal ✓
- Verify: "Revision karo" changes chapter_progress.status to 'revising' ✓
- Verify: next time chapter selected, shows "Revision Mode" ✓

---

### PHASE 5 — suggestedActions Persistence (1 day)

From the plan in Section 3.5:

**Files to modify:**
1. `backend/src/models/chatHistory.model.js` — add suggestedActions field
2. `backend/src/ask/step7.saveAndRespond.js` — save suggestedActions in addChatMessages call
3. `backend/src/controllers/session.controller.js` — include suggestedActions in history response
4. `frontend/src/pages/ChatPage.jsx` — convertDBMessage includes suggestedActions

**Test:**
- Ask a question → see chips ✓
- Refresh page → chips still visible on last Zuno message ✓

---

### PHASE 6 — study_events + user_study_stats (2 days, defer if Phase 1-5 not stable)

Only build this if:
- Phase 1-5 are stable and verified
- You have a specific feature that NEEDS this data (dashboard, streak display, weak-topic detection)

**Do NOT build speculatively.** The models are defined in this doc — implement when needed.

---

## 12. FILE CHANGE MATRIX (Complete Reference)

| Phase | File | Action | Purpose |
|-------|------|--------|---------|
| 1 | `backend/src/models/chapterProgress.model.js` | CREATE | Cross-session progress schema |
| 1 | `backend/src/models/studyEvent.model.js` | CREATE | Event log schema |
| 1 | `backend/src/services/chapterProgress.service.js` | CREATE | Service layer with Redis |
| 1 | `backend/src/controllers/chapterProgress.controller.js` | CREATE | HTTP handlers |
| 1 | `backend/src/routes/chapterProgress.routes.js` | CREATE | Route definitions |
| 1 | `backend/src/app.js` | MODIFY | Register new routes |
| 1 | `backend/src/models/chatSession.model.js` | MODIFY | +chapterProgressId, focusChapterSnapshot |
| 1 | `backend/src/models/chatHistory.model.js` | MODIFY | +suggestedActions in messages[] |
| 1 | `backend/src/ask/step2.loadSession.js` | MODIFY | Load + sync chapter progress |
| 1 | `backend/src/ask/step7.saveAndRespond.js` | MODIFY | Write chapter progress, log events |
| 1 | `backend/src/controllers/session.controller.js` | MODIFY | Include suggestedActions in history |
| 2 | `frontend/src/api/tutorApi.js` | MODIFY | Add chapter-progress fetch functions |
| 3 | `frontend/src/hooks/useChapterProgress.js` | CREATE | Progress hook with cache |
| 3 | `frontend/src/components/FocusModal.jsx` | MODIFY | "Continue" section |
| 3 | `frontend/src/pages/ChatPage.jsx` | MODIFY | Smart welcome, state, token warning |
| 3 | `frontend/src/components/FocusProgressHeader.jsx` | MODIFY | Show % + use chapterProgress hook |
| 3 | `frontend/src/components/Topbar.jsx` | MODIFY | Hinglish chapter name |
| 4 | `backend/src/ask/intentRouter.js` | MODIFY | CHAPTER_COMPLETE with suggestedActions |

---

## 13. TESTING CHECKLIST (Before Calling Each Phase Done)

### Phase 1 Checklist
```
□ MongoDB Atlas: chapter_progress collection visible
□ First /ask in focus mode: chapter_progress doc created
□ Second /ask: doc updated, completedTopicIds grows
□ New session same chapter: Step2 reads chapter_progress and syncs chatState
□ suggestedActions saved to chat_history.messages
□ getSessionHistory returns suggestedActions in each tutor message
□ Redis: chapter-progress key exists after first /ask
□ Redis: key deleted on next /ask write (invalidation)
```

### Phase 2 Checklist
```
□ GET /chapter-progress/chapter-03 returns null for new chapter
□ GET /chapter-progress/chapter-03 returns progress after first /ask
□ GET /chapter-progress?status=in_progress returns correct list
□ POST /chapter-progress/chapter-03/action {action:'reset'} → progress cleared
□ 404 for unknown chapterId
```

### Phase 3 Checklist
```
□ FocusModal: "Continue" section appears after one chapter started
□ FocusModal: No "Continue" section for brand new user
□ Select in-progress chapter: smart welcome with correct topic name
□ Select completed chapter: "Revision karo" prompt
□ Select new chapter: auto-ask fires
□ Page refresh during focus session: FocusProgressHeader shows correct % from chapter_progress
□ Action chips restored after refresh (Phase 5 dep)
□ Topbar shows Hinglish chapter name
□ Token warning banner appears at 85% of limit
```

### Phase 4 Checklist
```
□ Complete all topics: celebration message appears (not infinite loop)
□ "Agla chapter" chip → FocusModal opens
□ "Revision karo" chip → chapter status = 'revising'
□ Second completion of same chapter: different message ("Revision complete!")
```

---

## 14. OPEN DECISIONS (User Must Decide)

| # | Question | Options | My Recommendation |
|---|----------|---------|-----------------|
| 1 | Guest progress persistence? | A) Full (guestId in localStorage) B) None (login required) | B — login required. Simpler, and pushes toward account creation. Show "Login karke progress save karo" banner. |
| 2 | What happens to chatState.completedTopicIds after chapter_progress exists? | A) Keep in sync (both) B) Read from chapter_progress only | A — keep both. chatState is the per-session fast path. chapter_progress is the cross-session truth. They mirror each other. |
| 3 | FocusModal "Continue" section — show completed chapters? | A) Only in_progress B) Both in_progress and completed | A for now. Completed chapters go to a "Review" section later. |
| 4 | Token warning threshold | A) 85% B) 80% C) 90% | A — 85%. Gives 2-3 more turns before lock. Early enough to warn. |
| 5 | Phase 6 (study_events + stats) — build now or later? | A) Build with Phase 1 B) Build when feature needs it | B — build when needed. Don't speculate. |
| 6 | Chapter progress in FocusModal chapter list — show progress badges immediately? | A) Yes (requires listChapterProgress call on modal open) B) No (keep modal fast) | A — call is fast (Redis cached), and progress badges transform the UX. |

---

*Last reviewed: 2026-06-28. This document supersedes any prior ad-hoc architecture notes for cross-session focus mode progress. The session-level bug list lives in FOCUS_MODE_MASTER_PLAN.md.*
