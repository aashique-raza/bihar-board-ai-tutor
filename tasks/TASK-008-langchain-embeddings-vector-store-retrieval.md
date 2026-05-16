# TASK-008: LangChain Embeddings, Vector Store, and Retrieval

## Why this task was needed

The project already had curated Science content, a loader, and a tested chunker. The next required step was to turn chunks into embeddings, persist them locally, and prove retrieval works before adding final LLM answer generation.

This task completes the retrieval foundation only. It does not generate final student-facing answers yet.

## Final decisions

- Embedding provider: Gemini
- Embedding model: `gemini-embedding-001`
- Embedding integration: LangChain `GoogleGenerativeAIEmbeddings`
- Document abstraction: LangChain `Document`
- Vector store: LangChain `MemoryVectorStore`
- Persistence: local JSON file at `backend/storage/vector-store.json`
- Retrieval: LangChain `similaritySearchWithScore`
- Final AI answer generation: not included yet

## Why Gemini was selected

Gemini was selected as the first embedding provider because it fits the current project direction and keeps the first retrieval milestone simple. The project may benchmark OpenAI embeddings later, but Gemini is the current accepted provider.

## Why local JSON vector store was selected

Local JSON persistence keeps the MVP easy to inspect, commit-control, and debug. It avoids adding Qdrant, Chroma, MongoDB Vector Search, Supabase Vector, or another database before retrieval behavior is validated.

## Why LangChain MemoryVectorStore was used

This is a LangChain learning and RAG project. LangChain already provides embeddings, documents, vector stores, and retrieval primitives. `MemoryVectorStore` is enough for the current local MVP and keeps the implementation thin.

## Why manual custom vector search was rejected

The earlier manual embedding/search implementation was rejected because it bypassed LangChain primitives. The accepted implementation uses LangChain for embedding, document representation, vector storage, and similarity search.

## Files created or updated

- `backend/src/rag/embeddings/langchainGeminiEmbeddings.js`
- `backend/src/rag/vector-store/langchainMemoryVectorStorePersistence.js`
- `backend/src/rag/pipelines/indexPipeline.js`
- `backend/src/rag/pipelines/queryPipeline.js`
- `backend/scripts/test-langchain-embedding-smoke.js`
- `backend/scripts/validate-vector-store.js`
- `backend/scripts/test-vector-store-load-search.js`
- `backend/storage/vector-store.json`
- `backend/package.json`
- `backend/.env.example`

## Indexing flow

```text
Curated Markdown files
-> existing loader
-> existing chunker
-> LangChain Document objects
-> Gemini embeddings through LangChain
-> LangChain MemoryVectorStore
-> backend/storage/vector-store.json
```

Indexing command:

```bash
npm run rag:index
```

Verified indexing results:

- Documents loaded: 16
- Chunks generated: 600
- LangChain documents prepared: 600
- Total vectors saved: 600
- Observed embedding dimension: 3072

## Query flow

```text
Student question
-> load backend/storage/vector-store.json
-> restore LangChain MemoryVectorStore
-> LangChain embeds only the query
-> similaritySearchWithScore
-> print retrieved chunks with scores and metadata
```

Query command:

```bash
npm run rag:query -- "प्रकाश संश्लेषण क्या होता है?"
```

The query command does not re-embed all chunks. It loads saved vectors and embeds only the question.

## Commands used

```bash
npm run test:embedding-smoke
npm run rag:index
npm run test:vector-store
npm run test:retrieval
npm run rag:query -- "प्रकाश संश्लेषण क्या होता है?"
npm run rag:query -- "photosynthesis kya hota hai?"
```

## Test results

Vector store validation:

- Vector store validation passed
- `totalVectors`: 600
- `embeddingDimension`: 3072

Retrieval examples:

- `प्रकाश संश्लेषण क्या होता है?` retrieved Biology > Life Processes > Photosynthesis
- `photosynthesis kya hota hai?` retrieved Biology > Life Processes > Photosynthesis
- `acid base and salt kya hai?` retrieved Chemistry > Acids, Bases and Salts
- `human heart ka function kya hai?` retrieved Biology > Life Processes > Heart
- `electric current kya hota hai?` retrieved Physics > Electricity

## Current limitations

- `MemoryVectorStore` JSON persistence depends on LangChain's internal `memoryVectors` shape.
- This is acceptable for the local MVP, but not production storage.
- Embedding dimension is currently 3072, not optimized to 768 yet.
- Retrieval can sometimes return one irrelevant lower-ranked chunk.
- No hybrid search yet.
- No reranking yet.
- No final AI answer generation yet.

## Future upgrade path

- Benchmark OpenAI embeddings against Gemini embeddings.
- Tune embedding dimensionality if supported safely through LangChain.
- Add hybrid keyword plus vector search.
- Add reranking.
- Move to Qdrant, Chroma, MongoDB Vector Search, or Supabase Vector when local JSON is no longer enough.
- Add a grounded answer generation chain after retrieval quality is stable.

## Acceptance criteria

- LangChain `GoogleGenerativeAIEmbeddings` is used.
- LangChain `Document` is used.
- LangChain `MemoryVectorStore` is used.
- Indexing uses `MemoryVectorStore.fromDocuments(...)`.
- Query uses LangChain `similaritySearchWithScore(...)`.
- Manual custom vector search is not used.
- `backend/storage/vector-store.json` is created.
- 16 documents are indexed.
- 600 chunks are generated.
- 600 vectors are saved.
- Retrieval works for Hindi, Hinglish, and English queries.
- No final AI answer generation is added.

## Final status

DONE.

The LangChain-based embedding, local vector storage, and retrieval foundation is complete. The next step is to build the grounded RAG answer generation pipeline using retrieved chunks.
