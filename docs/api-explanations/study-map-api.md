# Study Map API Explanation

## API Name

Study Map API

## Final URL

```http
GET http://localhost:5000/api/v1/study-map
```

## Ye API Kyun Banayi Gayi Hai?

Hamare app me student ke paas do study modes honge:

1. Global Mode
2. Focus Study Mode

Global mode default rahega. Is mode me student direct question puch sakta hai, bina chapter select kiye.

Focus Study Mode optional rahega. Is mode me student kisi specific chapter ko select karke us chapter par focused study kar sakta hai.

Is API ka kaam frontend ko batana hai ki focus mode ke liye kaun sa study content available hai. Frontend ko subject, section, aur chapter list hardcode nahi karni chahiye. Backend hi batayega ki currently kaun se subjects aur chapters available hain.

## Hamne Iske Baare Me Kya Discuss Kiya Tha?

Discussion me ye decide hua tha ki:

- App ka default mode Global Mode rahega.
- Focus Study Mode user intentionally enable karega.
- Focus mode ka purpose hai ek selected chapter ke andar disciplined study karna.
- Focus mode me global fallback automatically nahi hona chahiye.
- Frontend chapter list apne andar hardcode nahi karega.
- Backend study-map provide karega.
- Abhi MongoDB ya koi database add nahi karna hai.
- Current source of truth curated markdown files rahengi.

DB abhi avoid kiya gaya kyunki hamare actual RAG content already `data/` folder me curated markdown files ke form me hai. Agar chapter list DB me rakhte, to DB, markdown files, aur vector-store metadata ke beech sync problem create ho sakti thi.

## Ye API Kya Karegi?

Ye API frontend ko study hierarchy degi:

```text
Science
-> Physics
-> Chapters

Science
-> Chemistry
-> Chapters

Science
-> Biology
-> Chapters
```

Abhi project sirf Class 10 Science ke liye hai, isliye response me sirf Science subject aata hai.

## Backend Ye Data Kahan Se Laata Hai?

Backend curated markdown documents se metadata read karta hai.

Important metadata:

- `subject`
- `section`
- `chapter_no`
- `original_science_chapter_no`
- `chapter_title`

Ye metadata har chapter markdown file ke frontmatter me hota hai.

## Request Payload

Is API me koi request body nahi hai.

```http
GET /api/v1/study-map
```

## Response Shape

Successful response standard `sendResponse` helper se aata hai.

```json
{
  "success": true,
  "message": "Study map fetched successfully.",
  "data": {
    "defaultStudyMode": "global",
    "supportedStudyModes": ["global", "focus"],
    "focusStudy": {
      "type": "chapter",
      "subjects": [
        {
          "id": "science",
          "title": "Science",
          "sections": [
            {
              "id": "physics",
              "title": "Physics",
              "chapters": [
                {
                  "id": "science.physics.chapter-01",
                  "number": 1,
                  "title": "Light - Reflection and Refraction",
                  "originalScienceChapterNumber": 10
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

## Response Keys Ka Meaning

`defaultStudyMode`

Frontend ko batata hai ki app ka default mode kya hoga. Abhi value `global` hai.

`supportedStudyModes`

Backend batata hai ki kaun se study modes supported hain. Abhi `global` aur `focus`.

`focusStudy.type`

Batata hai ki focus mode currently kis level par supported hai. Abhi focus chapter-level hai, isliye value `chapter`.

`subjects`

Available subjects ki list. Abhi sirf Science.

`sections`

Science ke andar sections hain:

- Physics
- Chemistry
- Biology

`chapters`

Specific section ke andar available chapters.

`chapter.id`

Ye stable backend id hai jo future Ask API me focus mode ke liye use hogi.

Example:

```text
science.physics.chapter-01
```

`originalScienceChapterNumber`

Original full Science syllabus ke chapter number ko preserve karta hai. Example: Physics section ka chapter 1 original Science chapter 10 ho sakta hai.

## Postman Test

Method:

```http
GET
```

URL:

```http
http://localhost:5000/api/v1/study-map
```

Body:

```text
No body required
```

Expected result:

```text
200 OK
success: true
defaultStudyMode: global
Science subject available
Physics 7 chapters
Chemistry 5 chapters
Biology 4 chapters
```

## Current Backend Files

Route:

```text
backend/src/routes/studyMap.routes.js
```

Controller:

```text
backend/src/controllers/studyMap.controller.js
```

Service:

```text
backend/src/services/studyMap.service.js
```

Test script:

```text
backend/scripts/test-study-map.js
```

Package script:

```bash
npm.cmd run test:study-map
```

## Future Scope

Later this API can support:

- More subjects.
- More classes.
- Disabled or coming-soon subjects.
- Chapter thumbnails or icons.
- Chapter progress.
- Recommended chapter order.
- Focus mode at section level, like full Physics or full Biology.
- Quiz availability per chapter.
- Published/unpublished content status.

But abhi intentionally simple rakha gaya hai. Current goal hai frontend ko available focus-study content dena without adding database complexity.

## GitHub Commit Message

```text
Add study map API for focus study mode
```
