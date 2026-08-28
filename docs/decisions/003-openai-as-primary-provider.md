# ADR-003: OpenAI as primary LLM and embedding provider

- **Date:** 2026-07 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
Groq was the original default (`llama-3.3-70b-versatile`). It produced repeated
429 rate-limit errors in normal use, which surfaced to students as failures.

## Decision
- **LLM:** OpenAI `gpt-4o-mini` for both decider and tutor (`LLM_PROVIDER=openai`)
- **Embeddings:** OpenAI `text-embedding-3-large`, 3072 dimensions
- **Fallback:** Gemini `gemini-embedding-001` — **query time only**, never at index time
- Groq and Google remain wired and switchable via env

## Why
- Groq's free-tier rate limits made it unusable for real traffic
- `gpt-4o-mini` is cheap enough for the current stage ($0.15/1M in, $0.60/1M out)
- Both embedding models are 3072-dim, so the fallback is dimensionally compatible

## Critical constraint
**Indexing must never fall back between providers.** OpenAI and Gemini vectors
live in different vector spaces. Mixing them in one store silently breaks
retrieval with no error. If `EMBEDDING_PROVIDER` changes, `npm run rag:index`
must be re-run in full.

> ⚠️ Known gap: the *query-time* fallback currently writes Gemini vectors into
> the OpenAI cache key for 30 days. Tracked as Stage 1 bug **BUG-6**.

## Rejected alternatives
| Option | Why not |
|---|---|
| Stay on Groq | Rate limits broke real usage |
| Larger OpenAI model | Cost; `gpt-4o-mini` is adequate for this task |
| Self-hosted | No operational capacity at this stage |

## Consequences
- **Easy:** reliable, cheap enough now, provider-switchable by env
- **Hard:** vendor dependency; cost scales linearly with turns (see `BACKLOG.md` R3)

## Revisit when
Monthly LLM spend exceeds budget, or answer quality is measurably limited by model size
