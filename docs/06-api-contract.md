# API Contract

## Current Note

This is a planned contract for the first backend milestone. Do not implement it until the user asks for application code.

## Endpoint

Planned endpoint:

```text
POST /api/ask
```

## Request

```json
{
  "question": "Student question in Hindi, Hinglish, or simple English"
}
```

## Successful Grounded Response

```json
{
  "status": "answered",
  "answer": "Simple Hinglish answer grounded in retrieved content.",
  "sources": [
    {
      "sourceId": "source-document-id",
      "chapterId": "verified-chapter-id",
      "chapterTitle": "Verified chapter title when available",
      "section": "Section or heading when available",
      "chunkId": "chunk-id"
    }
  ]
}
```

## Insufficient Context Response

```json
{
  "status": "insufficient_context",
  "answer": "Available material mein is question ka answer clearly nahi mila.",
  "sources": []
}
```

## Error Response

```json
{
  "status": "error",
  "answer": "Sorry, abhi answer generate karne mein problem aa rahi hai.",
  "sources": [],
  "error": {
    "code": "ERROR_CODE",
    "message": "Developer-facing error message"
  }
}
```

## Response Rules

- `answer` must be simple Hinglish.
- `status` must make the result clear.
- `sources` must be included for grounded answers.
- The system must refuse when retrieved content is insufficient.
- The system must not answer from general model knowledge.

## Future Fields

Possible later additions:

- Request language detection.
- Retrieval debug information.
- Confidence score.
- Chat session ID.
- User feedback fields.
- Content version.

These are not required for the first milestone.
