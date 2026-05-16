# RAG Embeddings and Vector Store

## Purpose

This document explains the current local MVP retrieval pipeline for the Bihar Board Class 10 Science AI Tutor.

The current stage retrieves relevant source chunks only. It does not generate final AI answers yet.

## Current Flow

```text
Loader
-> Chunker
-> LangChain Documents
-> Gemini Embeddings
-> LangChain MemoryVectorStore
-> JSON persistence
-> Query retrieval
```

## Components

### Loader

The existing Markdown loader reads curated Class 10 Science content and preserves metadata such as board, class, subject, section, chapter, and source file.

### Chunker

The existing chunker creates retrieval-friendly chunks from 16 Science documents. It preserves chapter and heading metadata and keeps source context inside chunk text.

Verified chunking result:

- Documents loaded: 16
- Chunks generated: 600

### LangChain Documents

Each chunk is converted into a LangChain `Document`.

The document `pageContent` includes a metadata prefix:

```text
Bihar Board Class 10 Science
Section: ...
Chapter: ...
Topic/Heading: ...

Content:
...
```

The document metadata preserves the original chunk metadata, including `chunk_id`, `source_path`, `file_name`, `heading_path`, and `originalText`.

### Gemini Embeddings

Embeddings use LangChain `GoogleGenerativeAIEmbeddings`.

Current model:

```text
gemini-embedding-001
```

Observed embedding dimension:

```text
3072
```

### MemoryVectorStore

The current vector store is LangChain `MemoryVectorStore`.

Indexing uses:

```text
MemoryVectorStore.fromDocuments(...)
```

Retrieval uses:

```text
similaritySearchWithScore(...)
```

### JSON Persistence

Because `MemoryVectorStore` is in-memory, this project saves its `memoryVectors` data to:

```text
backend/storage/vector-store.json
```

This is temporary local MVP persistence. It is not a production vector database.

## Commands

Run indexing:

```bash
npm run rag:index
```

Run retrieval:

```bash
npm run rag:query -- "your question"
```

Example:

```bash
npm run rag:query -- "प्रकाश संश्लेषण क्या होता है?"
```

## Verified Results

Index command:

- Documents loaded: 16
- Chunks generated: 600
- LangChain documents prepared: 600
- Total vectors saved: 600

Validation:

- Vector store validation passed
- `totalVectors`: 600
- `embeddingDimension`: 3072

Retrieval examples:

- `प्रकाश संश्लेषण क्या होता है?` retrieved Biology > Life Processes > Photosynthesis
- `photosynthesis kya hota hai?` retrieved Biology > Life Processes > Photosynthesis
- `acid base and salt kya hai?` retrieved Chemistry > Acids, Bases and Salts
- `human heart ka function kya hai?` retrieved Biology > Life Processes > Heart
- `electric current kya hota hai?` retrieved Physics > Electricity

## Current Limitations

- JSON persistence depends on LangChain's internal `memoryVectors` shape.
- This is acceptable for local MVP testing, but not production.
- Embedding dimension is currently 3072, not optimized to 768 yet.
- Retrieval can sometimes return one irrelevant lower-ranked chunk.
- No hybrid search yet.
- No reranking yet.
- No final AI answer generation yet.

## Next Step

Build the RAG answer generation pipeline:

- Take retrieved chunks.
- Format sources.
- Build a grounded prompt.
- Use an LLM through LangChain.
- Generate a simple Hinglish answer.
- Show sources.
- Refuse when context is insufficient.
- Avoid hallucination.
