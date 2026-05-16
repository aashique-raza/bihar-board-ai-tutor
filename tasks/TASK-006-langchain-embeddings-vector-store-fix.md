# TASK-006: LangChain Embeddings and Vector Store Fix

## What was wrong

The previous embedding and retrieval implementation manually wrapped Gemini embeddings and implemented custom in-memory cosine search. That was not correct for this project because the project is intended to be a LangChain learning and RAG project.

## Why manual embedding/search was wrong

Manual embedding calls and manual vector search hide the LangChain concepts this milestone is meant to teach and test. The active pipeline should use LangChain primitives where LangChain already provides them.

## Correct LangChain-based approach

The fixed pipeline uses:

- `GoogleGenerativeAIEmbeddings` from `@langchain/google-genai`
- `Document` from `@langchain/core/documents`
- `MemoryVectorStore` from `@langchain/classic/vectorstores/memory`
- `MemoryVectorStore.fromDocuments(...)` during indexing
- `similaritySearchWithScore(...)` during retrieval

## Files changed

- `backend/src/rag/embeddings/langchainGeminiEmbeddings.js`
- `backend/src/rag/vector-store/langchainMemoryVectorStorePersistence.js`
- `backend/src/rag/pipelines/indexPipeline.js`
- `backend/src/rag/pipelines/queryPipeline.js`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/.env.example`

## Why JSON persistence is still custom

LangChain `MemoryVectorStore` is intentionally in-memory and does not provide production persistence. For the MVP, the project saves the store's `memoryVectors` array to JSON and restores it into a new `MemoryVectorStore` instance during query.

## Why this is temporary MVP storage

Local JSON persistence is simple and transparent for debugging, but it is not optimized for large datasets, concurrent writes, filtering, or production retrieval latency.

## Acceptance criteria

- `indexPipeline.js` uses `MemoryVectorStore.fromDocuments(...)`.
- `indexPipeline.js` does not manually call document embedding functions.
- `queryPipeline.js` does not manually embed the query.
- `queryPipeline.js` does not manually calculate cosine similarity.
- The active pipeline does not import the old custom memory vector store.
- `npm run rag:index` creates `backend/storage/vector-store.json`.
- The JSON file stores LangChain `MemoryVectorStore` data.
- `npm run rag:query -- "question"` loads saved vectors.
- Query uses LangChain `similaritySearchWithScore(...)`.
- Query prints top chunks with scores and metadata.
- No final AI answer generation is added.
- Existing loader and chunker remain unchanged.

## Future upgrade path

- Move persistence to Chroma or Qdrant when a real vector database is needed.
- Benchmark OpenAI embeddings against Gemini embeddings.
- Add hybrid keyword plus vector search.
- Add reranking after first-pass retrieval.
- Add final RAG answer chain only after retrieval quality is verified.
