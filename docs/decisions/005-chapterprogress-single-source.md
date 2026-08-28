# ADR-005: ChapterProgress owns topic progress, not chatState

- **Date:** 2026-07 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
`currentTopicId` and `completedTopicIds` originally lived in `chatState` on the
session. Progress was therefore per-session: a student who started a new chat
lost their place in the chapter.

## Decision
`models/chapterProgress.model.js` is the single source of truth for topic
progress. `chatState` no longer carries these fields. Step 2 loads it fresh on
every focus turn; step 7 writes it with a bounded retry.

## Why
- Progress belongs to *(student, chapter)*, not to a chat session
- A student may open several sessions for one chapter and must not lose their place
- Guests and logged-in users both need it, so it is keyed by `userId` **or** `guestId`
- Writes are retried once, because a silent failure now means the advance is
  recorded nowhere — there is no chatState backup copy any more

## Rejected alternatives
| Option | Why not |
|---|---|
| Keep it in chatState | Progress lost on every new session |
| Write to both | Two sources of truth diverge — this was the original bug |

## Consequences
- **Easy:** progress survives sessions; the frontend gets a progress snapshot in
  the ask response with no extra API call
- **Hard:** one more read per focus turn (Redis-cached, 60s TTL)

## Revisit when
Progress needs to span subjects, or a full learner-model / analytics layer is built.
