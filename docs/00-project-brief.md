# Project Brief

## Product Goal

Build a Bihar Board Class 10 Science AI Tutor that answers student questions using approved study content through RAG.

The tutor should help students understand Science concepts in simple Hinglish while staying grounded only in the indexed source material.

## Target User

Bihar Board Class 10 students studying Science.

Students may ask questions in:

- Hindi.
- Hinglish.
- Simple English.

## Problem

Students need simple, trustworthy explanations that match their study material. A generic chatbot may answer from outside knowledge, use language that is too advanced, or provide unsupported claims.

This product should provide traceable answers from approved content only.

## Initial Scope

- Class 10 Science only.
- First milestone uses 2 verified chapters only.
- Chapter names are TBD.
- Backend RAG pipeline first.
- Local source text files first.
- Local vector store or JSON-based persistence first.
- One question-answer API endpoint later.

## Non-Goals

- No frontend in the first milestone.
- No database in the first milestone.
- No admin panel in the first milestone.
- No analytics in the first milestone.
- No quiz system in the first milestone.
- No authentication in the first milestone.
- No chat history in the first milestone.
- No PDF/OCR pipeline in the first milestone.
- No hardcoded chapter names before source verification.

## Success Criteria for First Milestone

The first milestone is successful when the system can:

- Load 2 verified Class 10 Science text files.
- Clean and chunk the content.
- Generate embeddings.
- Persist chunks locally.
- Retrieve relevant chunks for a student question.
- Generate a simple Hinglish answer using only retrieved content.
- Return source attribution.
- Clearly refuse when retrieved content is insufficient.

## Hard Constraints

- Do not answer from general model knowledge.
- Do not hallucinate.
- Answer only from retrieved/indexed content.
- Preserve source attribution.
- Keep final answers in simple Hinglish.
- Keep the first milestone thin and testable.
