# TASK-009: RAG Query Layer and Grounded Answer Generation

## Why this task was needed

The project already had a working Markdown loader, chunker, Gemini embeddings, and a valid local LangChain MemoryVectorStore. The next milestone was to make the query side usable end to end:

```text
Student question
-> retriever
-> reranker
-> grounded prompt
-> LLM answer
-> Hinglish answer with sources
```

The goal was backend-only RAG behavior. No frontend, auth, database, admin panel, quiz, analytics, or deployment code was added.

## Final decisions

- Retrieval still uses LangChain `MemoryVectorStore`.
- Query embeddings still use Gemini `gemini-embedding-001`.
- Manual cosine similarity was removed from the retriever path.
- A lightweight reranker was added after vector search.
- Final filtering allows fewer than `topK` results instead of filling weak matches.
- Answer generation uses LangChain LCEL:

```text
ChatPromptTemplate -> ChatModel -> StringOutputParser
```

- Default LLM provider is Groq.
- LLM provider can be changed from environment variables:
  - `LLM_PROVIDER=groq | openai | google`
  - `LLM_MODEL=...`
  - `LLM_TEMPERATURE=...`

## Folder structure changes

The RAG code was reorganized into indexing and query responsibilities:

```text
backend/src/rag/
  indexing/
    loaders/
    chunkers/
    embeddings/
    vector-store/
    pipelines/

  query/
    retriever/
    reranker/
    llm/
    prompts/
    chains/
    parsers/
    answer/
    pipelines/
```

This keeps document indexing separate from student query handling.

## Retrieval improvements

The retriever now:

- Loads the saved local JSON vector store.
- Rebuilds LangChain MemoryVectorStore without re-embedding stored documents.
- Caches loaded vector stores by path.
- Validates embedding dimension against the expected dimension.
- Fetches more candidates than the final `topK`.
- Applies reranking and final filtering.
- Returns debug counts:
  - candidates before rerank
  - candidates after `minScore`
  - eligible after final filtering
  - final returned chunks

The reranker uses lightweight signals:

- query intent detection
- keyword matches in heading, chapter title, and content
- overview boost for broad explanation questions
- function-query boost for direct-answer chunks
- light diversity control
- penalties for weak, unrelated, activity, and flowchart-style chunks when needed

## Answer generation improvements

The answer service now:

- Calls `retrieveRelevantChunks(question)`.
- Builds a strict grounded context from retrieved chunks.
- Uses `ChatPromptTemplate`, provider-based chat model selection, `RunnableSequence`, and `StringOutputParser`.
- Answers in simple Hinglish.
- Appends source metadata after every answer.
- Returns the safe fallback when no context is retrieved:

```text
Mere paas provided context me is question ka enough information nahi hai.
```

The tutor prompt was tightened so the model:

- does not repeat the student question
- does not answer from general knowledge
- avoids duplicate points
- keeps function answers direct and non-repetitive
- uses a warmer, teacher-like tone
- keeps answers exam-focused

The test output labels were also cleaned up to avoid confusing `Retrieved chunks` vs `After final filtering` counts.

## Key files created or updated

- `backend/src/rag/query/retriever/langchainMemoryStore.js`
- `backend/src/rag/query/retriever/retriever.js`
- `backend/src/rag/query/retriever/retriever.config.js`
- `backend/src/rag/query/reranker/reranker.js`
- `backend/src/rag/query/llm/chatModel.js`
- `backend/src/rag/query/llm/llm.config.js`
- `backend/src/rag/query/prompts/tutorPrompt.js`
- `backend/src/rag/query/chains/ragAnswerChain.js`
- `backend/src/rag/query/parsers/stringParser.js`
- `backend/src/rag/query/answer/answerService.js`
- `backend/src/rag/query/pipelines/queryPipeline.js`
- `backend/scripts/test-retriever.js`
- `backend/scripts/test-rag-answer.js`
- `backend/package.json`
- `backend/.env.example`

## Commands used

```bash
npm run test:vector-store
npm run test:retrieval
npm run rag:test-retriever
npm run rag:test-answer
```

## Verified behavior

- Vector store validation passed.
- Total vectors: `600`.
- Embedding dimension: `3072`.
- Retriever works for Hindi, Hinglish, and English-style questions.
- `blood ka function kya hai?` now ranks blood/transport chunks above placenta and flowchart chunks.
- `placenta ka function kya hai?` still ranks placenta chunks correctly.
- `human digestion explain karo` prefers broader digestion/nutrition chunks before narrow subtopics.
- Irrelevant chunks with no matched terms are not returned just to fill `topK`.
- Answer generation works with Groq using `GROQ_API_KEY`.
- No-context questions return the safe fallback.
- Sources are included after each answer.

## Sample answer behavior

Question:

```text
placenta ka function kya hai?
```

Answer style:

```text
Placenta ka main role mother aur embryo ke beech material exchange surface ka kaam karna hai.
- Yah glucose ko mother se embryo tak pahunchata hai.
- Yah oxygen ko mother se embryo tak pahunchata hai.
- Yah anya nutrients ko mother se embryo tak pahunchata hai.
- Yah embryo se waste ko mother ke blood me remove karta hai.
- Yah badi surface area pradaan karta hai material exchange ke liye.
```

## Current limitations

- The local JSON MemoryVectorStore is still an MVP storage choice, not production storage.
- Reranking is heuristic and lightweight, not a trained cross-encoder reranker.
- Some broad questions may still need prompt/reranker tuning as more chapters and question styles are tested.
- The answer chain depends on external LLM availability and valid API keys.

## Final status

DONE.

The backend RAG query layer and grounded answer generation layer are working and tested. The next recommended step is to expose this through a minimal backend API endpoint.
