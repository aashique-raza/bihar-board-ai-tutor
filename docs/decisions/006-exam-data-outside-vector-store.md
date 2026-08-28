# ADR-006: Exam pattern data stays out of the vector store

- **Date:** 2026-08 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
Students ask exam questions — marks per subject, chapter weightage, passing
criteria, paper structure. These need **exact numbers**.

## Decision
Exam data lives in `data/class-10/global/exam_patterns.json`, read by
`knowledge/examKnowledgeService.js`. The `EXAM_INFO` intent bypasses vector
search entirely. When the decider identifies a specific entity, the exact fact is
computed in code and prepended as a fixed block, so the LLM repeats a number
rather than composing one.

## Why
- RAG is probabilistic. Marks are not. A retrieved-and-paraphrased number can be
  wrong, and a wrong exam number damages a student's preparation
- **Entity conflict:** a query like "Light chapter ke marks?" would retrieve
  optics *content* chunks, not marks data
- The JSON is small, so a full lookup is both cheaper and exact

## Rejected alternatives
| Option | Why not |
|---|---|
| Index exam data as chunks | Probabilistic retrieval of exact numbers; entity conflict with content chunks |
| Let the LLM answer from general knowledge | Violates the core product rule |

## Consequences
- **Easy:** exam answers are deterministic and correct
- **Hard:** a second content pipeline to maintain — though JSON updates need no
  re-index, which is also a benefit

## Revisit when
Exam data grows large enough that dumping it into a prompt becomes wasteful.
