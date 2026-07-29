# TASK-007: LangChain Embedding Retrieval Tests

## What was tested

- LangChain package imports.
- Environment key presence without printing secrets.
- LangChain Gemini embedding smoke script.
- Existing chunker test suite.
- LangChain indexing command.
- Vector store JSON validation script.
- LangChain MemoryVectorStore load/search script.
- Main query pipeline for Hindi and Hinglish queries.
- Active code scan for old manual embedding/vector-store usage.

## Commands run

```bash
npm install
node --input-type=module -e "import '@langchain/google-genai'; import '@google/generative-ai'; import '@langchain/core/documents'; import '@langchain/classic/vectorstores/memory'; import './src/rag/embeddings/langchainGeminiEmbeddings.js'; import './src/rag/vector-store/langchainMemoryVectorStorePersistence.js'; console.log('LangChain import check passed');"
npm run test:chunks
npm run test:embedding-smoke
npm run rag:index
npm run test:vector-store
npm run test:retrieval
npm run rag:query -- "प्रकाश संश्लेषण क्या होता है?"
npm run rag:query -- "photosynthesis kya hota hai?"
```

## Results

- Dependency install passed.
- Import check passed.
- `.env` contains an API key variable; the value was not printed.
- Existing chunker tests passed: 27/27.
- Embedding smoke test failed because Gemini returned `429 Too Many Requests`.
- Indexing failed because Gemini returned `429 Too Many Requests`.
- `storage/vector-store.json` was not created because indexing failed.
- Vector store validation failed because the vector store file does not exist.
- Retrieval smoke test failed because the vector store file does not exist.
- Main query commands failed because the vector store file does not exist.

## Bugs found

LangChain's default `AsyncCaller` retry settings can wait for a long time on Gemini quota/rate-limit failures. This made quota failures slow and unclear during testing.

## Fixes made

- Added verification scripts:
  - `scripts/test-langchain-embedding-smoke.js`
  - `scripts/validate-vector-store.js`
  - `scripts/test-vector-store-load-search.js`
- Added npm scripts for those checks.
- Set the LangChain embeddings wrapper to use `maxConcurrency: 1` and `maxRetries: 0`.
- Kept a small explicit retry wrapper for retryable embedding failures.
- Confirmed active pipelines still use:
  - `MemoryVectorStore.fromDocuments(...)`
  - `similaritySearchWithScore(...)`

## Final status

FAIL for end-to-end retrieval verification because live Gemini embedding calls are blocked by quota exhaustion.

The code path is still LangChain-based, but the acceptance criteria requiring successful indexing and retrieval cannot pass until Gemini embedding quota is available again.

## Known limitations

- MemoryVectorStore JSON persistence depends on LangChain's internal `memoryVectors` shape.
- Current vector store is local MVP storage only.
- No final answer generation exists yet.
- No hybrid search exists yet.
- No reranking exists yet.

## Next step

After Gemini quota resets or a higher-limit API key is configured, rerun:

```bash
npm run test:embedding-smoke
npm run rag:index
npm run test:vector-store
npm run test:retrieval
npm run rag:query -- "photosynthesis kya hota hai?"
```
