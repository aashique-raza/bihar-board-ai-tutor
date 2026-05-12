# API Contract

This is the planned first API contract for the thin RAG backend. It may change during implementation, but should stay small.

## Endpoint

```http
POST /api/ask
```

## Purpose

Accept a student question and return a grounded simple Hinglish answer with sources.

## Request Body

```json
{
  "question": "प्रकाश संश्लेषण क्या होता है?",
  "language_hint": "hi"
}
```

## Request Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `question` | string | yes | Student question in Hindi, Hinglish, or simple English. |
| `language_hint` | string | no | Optional hint such as `hi`, `hinglish`, or `en`. |

## Successful Response

```json
{
  "answer": "Photosynthesis ek process hai jisme green plants sunlight ki help se carbon dioxide aur water se food banate hain. Is process me oxygen bhi release hoti hai.",
  "sources": [
    {
      "chapter_id": "chapter-01",
      "chapter_title": "Life Processes",
      "section_title": "Photosynthesis",
      "source_file": "chapter-01.pdf",
      "page": 12
    }
  ],
  "retrieval": {
    "top_k": 4,
    "used_chunk_ids": ["chapter-01:chunk-003"]
  },
  "status": "answered"
}
```

## Insufficient Content Response

```json
{
  "answer": "Is question ka answer available chapter content me clearly nahi mila. Please chapter/section specify karo ya doosra question pucho.",
  "sources": [],
  "retrieval": {
    "top_k": 4,
    "used_chunk_ids": []
  },
  "status": "insufficient_content"
}
```

## Response Fields

| Field | Type | Notes |
| --- | --- | --- |
| `answer` | string | Simple Hinglish answer or safe refusal. |
| `sources` | array | Source references used for the answer. |
| `retrieval` | object | Debug-friendly retrieval metadata. |
| `status` | string | `answered` or `insufficient_content`. |

## API Rules

- The endpoint must not answer without retrieved content.
- The endpoint must return sources when status is `answered`.
- The endpoint must return simple Hinglish answer text.
- The endpoint should keep retrieval metadata available during early development.
- The endpoint should not expose raw prompt text.
