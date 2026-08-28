# ADR-002: MongoDB Atlas Vector Search as the vector store

- **Date:** 2026-06 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
The original implementation used LangChain's `MemoryVectorStore`, persisted to a
JSON file on disk. This does not survive multi-instance deploys and loads the
entire index into process memory at boot.

## Decision
Store chunks in MongoDB (`models/chunk.model.js`) and query via Atlas
`$vectorSearch`. `rag/retriever.js` builds the aggregation pipeline directly.
No JSON vector file remains in the runtime path.

## Why
- MongoDB Atlas is already the primary database — no new infrastructure
- Survives restarts and works across multiple server instances
- Metadata pre-filtering (`chapter_no`, `section`) is native, which Focus Mode needs
- LangChain is still used for chunking, embeddings, and prompts — only vector storage moved

## Rejected alternatives
| Option | Why not |
|---|---|
| Pinecone / Weaviate | Another vendor, another bill, another failure mode for a 600-chunk index |
| Keep MemoryVectorStore + JSON | Breaks on multi-instance deploy; index reload on every boot |
| pgvector | Would require adding Postgres alongside MongoDB |

## Consequences
- **Easy:** one database, scales with the existing plan, native metadata filters
- **Hard:** requires the `vector_index` Atlas index to exist; vector search quality degrades on shared/free tiers at scale (see `BACKLOG.md` R4)

## Revisit when
Daily actives cross ~1,000 and Atlas tier cost exceeds a dedicated vector DB
