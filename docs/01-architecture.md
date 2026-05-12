# Architecture

## Overview

The project should begin as a minimal backend RAG system.

```text
Raw chapter content
-> loader
-> cleaner
-> chunker
-> embeddings
-> vector store
-> retriever
-> grounded answer generator
-> API response
```

## Stage 1: Minimal Backend Setup

Create the smallest backend needed to run the RAG flow and expose one question-answer endpoint.

No frontend.  
No database.  
No auth.  
No admin panel.

## Stage 2: Data Loading

Load approved source files for the first 2 chapters. Content may be Hindi. Each loaded document should carry metadata:

- Subject
- Class
- Chapter
- Section, if available
- Source file
- Page, paragraph, or location reference if available

## Stage 3: Text Cleaning

Clean text enough for retrieval quality:

- Remove repeated headers and footers.
- Normalize whitespace.
- Preserve Hindi text.
- Preserve formulas, units, and important terms.
- Avoid aggressive translation during cleaning.

## Stage 4: Chunking

Split content into meaningful chunks.

Chunks should be:

- Small enough for precise retrieval.
- Large enough to preserve explanation context.
- Linked to source metadata.

## Stage 5: Embeddings

Generate embeddings for each chunk. The embedding model should handle Hindi and mixed-language content well.

## Stage 6: Vector Store

Use a simple local vector store for the first milestone. This keeps setup fast and avoids database work.

## Stage 7: Retriever

Given a question, retrieve top matching chunks. The retriever should return:

- Chunk text
- Relevance score, if available
- Chapter metadata
- Source reference

## Stage 8: Grounded Hinglish Answer Generation

The generator receives only:

- The user question
- Retrieved chunks
- Source metadata

It must produce:

- Simple Hinglish answer
- Sources used
- Safe refusal if chunks do not answer the question

## Stage 9: API Endpoint

Expose one endpoint for asking questions. The endpoint should return answer text, sources, and basic retrieval metadata.

## Later Stages

Frontend, admin panel, analytics, and quiz features should come only after the backend pipeline is reliable.
