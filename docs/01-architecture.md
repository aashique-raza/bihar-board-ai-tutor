# Architecture

## First Milestone Boundary

The first milestone is backend-only. It proves the RAG pipeline before any frontend, database, admin panel, analytics, or quiz work begins.

## Main Architecture

```text
                     ┌────────────────────┐
                     │  Study Content      │
                     │  TXT first          │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │  Loader             │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │  Cleaner            │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │  Chunker + Metadata │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │  Embeddings         │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │ Local Vector Store  │
                     └─────────┬──────────┘
                               │
Student Question ───►│ Retriever           │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │ Grounded Prompt     │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │ LLM Generator       │
                     └─────────┬──────────┘
                               │
                     ┌─────────▼──────────┐
                     │ Hinglish Answer     │
                     │ + Sources + Status  │
                     └────────────────────┘
```

## Indexing Flow

```text
Study Content
-> Data Loader
-> Text Cleaner
-> Chunker
-> Metadata Builder
-> Embedding Generator
-> Local Vector Store
```

The indexing flow prepares approved study content for retrieval. For the first milestone, input content should be clean `.txt` files from 2 verified Class 10 Science chapters.

## Query/Answer Flow

```text
Student Question
-> API Endpoint
-> Query Processing
-> Vector Search
-> Relevant Chunks
-> Grounded Hinglish Prompt
-> LLM
-> Answer + Sources + Status
```

The answer generator must use only the retrieved chunks. If the retrieved chunks are insufficient, the response should clearly say that the available material does not contain the answer.

## Storage Layers

First milestone:

- Local files for source content.
- Local vector store or JSON-based persisted store.
- No MongoDB.
- No Postgres.
- No production vector database.

Future storage:

- MongoDB or Postgres for users, chat history, feedback, and content metadata.
- Vector database for semantic search at larger scale.
- File storage for PDFs, images, and documents.

## Future Architecture Additions

Possible later additions:

- Frontend student interface.
- Admin content management.
- Database-backed chat history and feedback.
- Production vector database.
- PDF/OCR ingestion.
- Quiz and practice features.
- Analytics and quality monitoring.

These are intentionally excluded from the first milestone.
