# ADR-008: All answers in simple Roman-script Hinglish

- **Date:** 2026-05 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
Students write in Hindi (Devanagari), Hinglish (Roman script), or simple English
— often mixed within a single message. The study content in `data/` is written
in English.

## Decision
Answers are always in simple Roman-script Hinglish, except when the student
writes in Devanagari — then Hindi in Devanagari. A science glossary enforces
consistent term translation.

## Why
- Bihar Board students read Roman script comfortably and think in Hindi
- Pure English creates a comprehension barrier; pure Devanagari is slower to read
  on phones
- A shared glossary stops the same term being translated differently across turns

## Known inconsistency
`utils/languageDetector.js` can only ever return `hindi` or `hinglish` — the
`english` branch is unreachable. The comment justifying this states that the
vector store is "indexed in Hinglish", which is **factually wrong**: `data/` is
English, and `rag/retriever.js` says so explicitly.

The decision is probably still correct. The stated reason is not.
Tracked in `BACKLOG.md` as O14.

## Rejected alternatives
| Option | Why not |
|---|---|
| Match the student's exact language | English answers add a comprehension barrier for this audience |
| Devanagari everywhere | Slower to read on phones; most students type in Roman |

## Consequences
- **Easy:** consistent voice; students understand without mentally translating
- **Hard:** the glossary costs roughly 1,200 tokens per study turn
  (`BACKLOG.md` O8), and it is currently skipped for Devanagari answers
  (Stage 1 bug BUG-7)

## Revisit when
Student feedback shows real demand for English answers.
