# Project Brief

## Name

Bihar Board Class 10 Science AI Tutor.

## Goal

Build an AI tutor that answers Bihar Board Class 10 Science questions using approved study content. Students can ask questions in Hindi, Hinglish, or simple English. The tutor replies in simple Hinglish and includes sources.

## Initial Scope

The first version must be intentionally small:

- Class 10 Science only.
- 2 chapters only.
- Backend RAG pipeline only.
- No frontend.
- No database.
- No admin panel.
- No analytics.
- No quiz.

## Core User Flow

1. Student asks a Science question.
2. System searches indexed chapter content.
3. System retrieves relevant chunks.
4. AI generates an answer only from retrieved chunks.
5. Student receives a simple Hinglish answer with sources.

## Student Experience

The answer should feel like a helpful tutor:

- Simple words.
- Short explanation first.
- Step-by-step detail only when useful.
- Hindi/Hinglish-friendly terminology.
- No unnecessary English complexity.
- No unsupported facts.

## Hard Constraints

- The assistant must not hallucinate.
- It must not answer from general model knowledge.
- It must answer only from retrieved content.
- If the answer is missing from retrieved content, it must say so clearly.
- Sources must be included.

## First Milestone Success Criteria

The project reaches the first milestone when:

- 2 chapters are loaded and indexed.
- A backend endpoint accepts a question.
- Retrieval returns relevant chunks.
- Answer generation produces simple Hinglish.
- Every answer includes source references.
- Insufficient-content questions are refused safely.
