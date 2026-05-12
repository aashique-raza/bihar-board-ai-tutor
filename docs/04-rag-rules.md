# RAG Rules

## Core Rule

The system must answer only from retrieved/indexed source content.

It must not answer from general model knowledge.

## Refusal Rule

If retrieved content is insufficient, irrelevant, or missing, the system must clearly refuse.

Recommended student-facing refusal style:

```text
Available material mein is question ka answer clearly nahi mila.
```

The refusal may include a short suggestion to ask a related question from the available chapter material, but it must not invent an answer.

## Language Rules

- Source content may be Hindi.
- User questions may be Hindi, Hinglish, or simple English.
- Final answer must be simple Hinglish.
- Avoid overly formal or advanced language.
- Keep explanations student-friendly.

## Grounding Rules

The prompt sent to the LLM must include:

- Retrieved chunks.
- Source metadata.
- Instruction to answer only from the chunks.
- Instruction to refuse if chunks are insufficient.
- Instruction to produce simple Hinglish.
- Instruction to include sources.

## Source Attribution

Every successful answer must include sources.

Sources should be traceable to:

- Chapter/source document.
- Section or heading if available.
- Chunk ID or location if available.

## Retrieval Rules

Retriever should return:

- Relevant chunks.
- Similarity/relevance scores if available.
- Metadata for each chunk.

The system should treat low-confidence retrieval as insufficient rather than forcing an answer.

## Answer Status

API responses should include a status such as:

- `answered`
- `insufficient_context`
- `error`

## Do Not

- Do not hallucinate.
- Do not add outside facts.
- Do not answer from memory.
- Do not hide missing context.
- Do not omit sources for grounded answers.
- Do not hardcode chapter names before verification.
