# Ask API Explanation

## Endpoint

```http
POST http://localhost:5000/api/v1/ask
```

## Purpose

This is the main Zuno tutor endpoint. It accepts a student message, keeps session continuity, optionally retrieves approved study content, and returns a structured tutor response.

The current Ask API uses the LLM-first flow:

```text
User message
-> compact memory + recent history
-> LLM scope/retrieval decider
-> optional RAG retrieval
-> tutor response LLM
-> structured sections + sources
-> save history/state
```

## Request

Global mode:

```json
{
  "question": "physics ka matlab samjhao",
  "studyMode": "global",
  "sessionId": "optional-existing-session-id"
}
```

Focus mode:

```json
{
  "question": "ohm law kya hai?",
  "studyMode": "focus",
  "chapterId": "science.physics.chapter-03",
  "sessionId": "optional-existing-session-id"
}
```

Rules:

- `question` is required.
- `studyMode` must be `global` or `focus`.
- `chapterId` is required only in focus mode.
- `chapterId` is not allowed in global mode.

## Response

Current response shape:

```json
{
  "success": true,
  "message": "Question processed successfully.",
  "data": {
    "status": "answered",
    "intent": "study_tutor",
    "responseMode": "study_tutor",
    "studyMode": "global",
    "question": "physics ka matlab samjhao",
    "detectedLanguage": "hinglish",
    "answerLanguage": "hinglish",
    "title": "Physics",
    "sections": [
      {
        "heading": "Simple matlab",
        "content": "Physics science ka wo part hai jisme hum motion, force, light, electricity aur energy jaisi cheezon ko samajhte hain."
      }
    ],
    "answer": "Physics\n\nSimple matlab\nPhysics science ka wo part hai...",
    "sources": [],
    "suggestedActions": [],
    "retrieval": null,
    "decision": {
      "inScope": true,
      "needsRetrieval": false,
      "responseMode": "study_tutor",
      "searchQuery": null
    },
    "session": {
      "sessionId": "generated-or-reused-session-id",
      "lastTopic": null,
      "lastDoubtTopic": null,
      "lastSubject": null,
      "lastSection": null,
      "lastChapterId": null
    }
  }
}
```

## Response Fields

`status`

Main result status. Common values:

- `answered`
- `insufficient_context`
- `needs_clarification`
- `out_of_scope`

`responseMode`

High-level response mode from the LLM-first flow:

- `conversation`
- `study_tutor`
- `redirect`

`sections`

Structured response blocks for frontend rendering. The frontend should prefer this over parsing the `answer` string.

`answer`

Compatibility text made from `title` + `sections`. Kept for older UI paths.

`sources`

Compact sources attached when RAG retrieval returns approved content.

`decision`

Debuggable decider output. Useful during MVP QA; can be hidden later.

`session`

Session continuity data.

## Current Frontend Behavior

The frontend now renders `sections` for Zuno responses, so headings and content do not appear glued together in one paragraph.

## Validation Errors

Missing question:

```json
{
  "success": false,
  "error": {
    "message": "question is required.",
    "statusCode": 400
  }
}
```

Invalid study mode:

```json
{
  "success": false,
  "error": {
    "message": "studyMode must be either \"global\" or \"focus\".",
    "statusCode": 400
  }
}
```

Focus mode without chapter:

```json
{
  "success": false,
  "error": {
    "message": "chapterId is required when studyMode is \"focus\".",
    "statusCode": 400
  }
}
```

Invalid chapter:

```json
{
  "success": false,
  "error": {
    "message": "Chapter not found for chapterId: science.biology.chapter-99",
    "statusCode": 404
  }
}
```

## Known Gaps

- Foundation/orientation content is not complete yet.
- Questions like `Science kya hai?`, `Physics kya hai?`, and `main padh kar bhool jata hu` need curated Markdown content for reliable grounded answers.
- MongoDB Atlas access may block local DB smoke tests if the current IP is not allowlisted.
