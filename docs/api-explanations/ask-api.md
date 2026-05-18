# Ask API Explanation

## API Name

Ask API

## Final URL

```http
POST http://localhost:5000/api/v1/ask
```

## Ye API Kyun Banayi Gayi Hai?

Ye main student question API hai. Student Hindi, Hinglish, ya simple English me question puch sakta hai. Backend question ko RAG pipeline se process karega, approved indexed study content se relevant chunks retrieve karega, aur grounded answer return karega.

Is API ka goal hai:

- Global Mode me full available Science content se answer dena.
- Focus Mode me sirf selected chapter ke andar answer dena.
- Answer ke saath sources dena.
- Agar selected chapter me answer nahi mile, to frontend ko structured signal dena taaki chat me "Switch to Global Mode" aur "Cancel" buttons dikh sakein.

## Hamne Iske Baare Me Kya Discuss Kiya Tha?

Discussion me ye final decisions liye gaye:

- App ka default mode Global Mode rahega.
- Focus Study Mode optional rahega.
- Focus mode strict rahega.
- Focus mode me automatic global fallback nahi hoga.
- Agar selected chapter me answer nahi mila, backend `focus_context_not_found` status bhejega.
- Frontend natural language message parse nahi karega.
- Frontend `status` aur `suggestedActions` ke base par buttons show karega.
- Debug/retrieval details client ko send nahi karenge.
- LLM se structured output abhi force nahi karenge.
- Backend final API response ko structured banayega.
- Language detection manual lightweight logic se hogi.
- English question ka answer simple English me aayega.
- Hindi, Hinglish, ya uncertain question ka answer simple Hinglish me aayega.
- Hinglish answer Roman script me hoga, Devanagari/Hindi script me nahi.

## Request Payload

### Global Mode

```json
{
  "question": "what is photosynthesis?",
  "studyMode": "global"
}
```

Global mode me `chapterId` nahi bhejna hai.

### Focus Mode

```json
{
  "question": "nutrition kya hota hai?",
  "studyMode": "focus",
  "chapterId": "science.biology.chapter-01"
}
```

Focus mode me `chapterId` required hai. Ye `chapterId` Study Map API se milega.

## Request Keys Ka Meaning

`question`

Student ka actual question. Required.

`studyMode`

Question kis mode me ask ho raha hai.

Allowed values:

- `global`
- `focus`

`chapterId`

Sirf focus mode ke liye required. Isse backend selected chapter identify karta hai aur retrieval ko strict chapter scope me rakhta hai.

## Successful Answer Response

```json
{
  "success": true,
  "message": "Question processed successfully.",
  "data": {
    "status": "answered",
    "studyMode": "focus",
    "question": "nutrition kya hota hai?",
    "detectedLanguage": "hinglish",
    "answerLanguage": "hinglish",
    "answer": "Nutrition ka matlab hai...",
    "sources": [
      {
        "sourceNumber": 1,
        "chapterTitle": "Life Processes",
        "section": "Biology",
        "headingPath": "Chapter 1: Life Processes > Nutrition",
        "chunkId": "biology-chapter-01-chunk-003"
      }
    ],
    "suggestedActions": [],
    "scope": {
      "chapterId": "science.biology.chapter-01",
      "chapterTitle": "Life Processes",
      "sectionId": "biology",
      "sectionTitle": "Biology",
      "subjectId": "science",
      "subjectTitle": "Science"
    }
  }
}
```

## Focus Mode Me Answer Na Mile To Response

```json
{
  "success": true,
  "message": "Question processed successfully.",
  "data": {
    "status": "focus_context_not_found",
    "studyMode": "focus",
    "question": "ohm law kya hai?",
    "detectedLanguage": "hinglish",
    "answerLanguage": "hinglish",
    "answer": "Mere paas selected chapter ke provided context me is question ka enough information nahi hai. Aap chaho to Global Mode me search kar sakte ho.",
    "sources": [],
    "suggestedActions": [
      {
        "type": "switch_to_global",
        "label": "Switch to Global Mode"
      },
      {
        "type": "cancel",
        "label": "Cancel"
      }
    ],
    "scope": {
      "chapterId": "science.biology.chapter-01",
      "chapterTitle": "Life Processes",
      "sectionId": "biology",
      "sectionTitle": "Biology",
      "subjectId": "science",
      "subjectTitle": "Science"
    }
  }
}
```

Frontend isi response me `suggestedActions` ke base par same chat bubble me buttons show karega.

## Global Mode Me Answer Na Mile To Response

```json
{
  "success": true,
  "message": "Question processed successfully.",
  "data": {
    "status": "global_context_not_found",
    "studyMode": "global",
    "question": "random unrelated question",
    "detectedLanguage": "english",
    "answerLanguage": "english",
    "answer": "Mere paas provided Science content me is question ka enough information nahi hai.",
    "sources": [],
    "suggestedActions": [],
    "scope": null
  }
}
```

## Status Values

`answered`

Relevant context mila aur answer generate hua.

`focus_context_not_found`

Focus mode me selected chapter ke andar enough context nahi mila. Frontend switch/cancel buttons dikha sakta hai.

`global_context_not_found`

Global mode me available Science content ke andar enough context nahi mila.

## Error Responses

Validation errors central error middleware se aayenge.

### Missing Question

```json
{
  "success": false,
  "error": {
    "message": "question is required.",
    "statusCode": 400
  }
}
```

### Invalid Study Mode

```json
{
  "success": false,
  "error": {
    "message": "studyMode must be either \"global\" or \"focus\".",
    "statusCode": 400
  }
}
```

### Focus Mode Without Chapter

```json
{
  "success": false,
  "error": {
    "message": "chapterId is required when studyMode is \"focus\".",
    "statusCode": 400
  }
}
```

### Invalid Chapter

```json
{
  "success": false,
  "error": {
    "message": "Chapter not found for chapterId: science.biology.chapter-99",
    "statusCode": 404
  }
}
```

## Postman Tests

### Global Mode

Method:

```http
POST
```

URL:

```http
http://localhost:5000/api/v1/ask
```

Body:

```json
{
  "question": "what is photosynthesis?",
  "studyMode": "global"
}
```

### Focus Mode

Method:

```http
POST
```

URL:

```http
http://localhost:5000/api/v1/ask
```

Body:

```json
{
  "question": "nutrition kya hota hai?",
  "studyMode": "focus",
  "chapterId": "science.biology.chapter-01"
}
```

### Focus Mode Out Of Chapter

Method:

```http
POST
```

URL:

```http
http://localhost:5000/api/v1/ask
```

Body:

```json
{
  "question": "ohm law kya hai?",
  "studyMode": "focus",
  "chapterId": "science.biology.chapter-01"
}
```

Expected:

```text
status: focus_context_not_found
suggestedActions: switch_to_global, cancel
```

## Current Backend Files

Route:

```text
backend/src/routes/ask.routes.js
```

Controller:

```text
backend/src/controllers/ask.controller.js
```

Service:

```text
backend/src/services/ask.service.js
```

Language detector:

```text
backend/src/utils/languageDetector.js
```

Retriever filter:

```text
backend/src/rag/query/retriever/retriever.js
```

## Future Scope

Later this API can support:

- User-selected answer language.
- Streaming responses.
- Chat history.
- Per-chapter quiz handoff.
- Chapter summary mode.
- Section-level focus mode, like full Physics or full Biology.
- Better language detection using a small model if manual detection becomes weak.
- Production vector database filters.

## GitHub Commit Message

```text
Add ask API with global and focus study modes
```
