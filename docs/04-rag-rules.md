# RAG Rules

## Purpose

These rules define how the tutor retrieves content and generates answers.

## Retrieval Rules

- Retrieve only from indexed Bihar Board Class 10 Science content.
- Start with the first 2 approved chapters only.
- Return top relevant chunks with metadata.
- Prefer precision over broad coverage.
- Do not use content from unapproved sources.

## Generation Rules

The answer generator must:

- Use only retrieved chunks.
- Not use general model knowledge.
- Not invent definitions, examples, formulas, or facts.
- Write in simple Hinglish.
- Include sources.
- Say when the retrieved material is insufficient.

## Safe Refusal

If the retrieved chunks do not contain the answer, reply with a short message like:

```text
Is question ka answer available chapter content me clearly nahi mila. Please chapter/section specify karo ya doosra question pucho.
```

The refusal should still include any retrieval metadata useful for debugging, but it should not pretend to answer.

## Answer Style

Use simple Hinglish:

- Explain like a Class 10 tutor.
- Keep sentences short.
- Use Hindi-friendly terms where natural.
- Use English scientific terms when they are common in textbooks.
- Avoid complex wording.

Example style:

```text
Photosynthesis ek process hai jisme green plants sunlight ki help se carbon dioxide aur water se food banate hain. Is process me oxygen bhi release hoti hai.
```

## Source Style

Each answer should include sources in a simple list:

```text
Sources:
- Chapter 1, Section: ...
- Chapter 1, Page: ...
```

Exact source format can improve later, but every answer must be traceable to chunks.

## Prompt Requirements

The generation prompt should clearly say:

- Answer only from provided context.
- If context is insufficient, refuse.
- Final answer must be simple Hinglish.
- Do not mention unsupported facts.
- Include sources.

## Quality Checks

For each test question, check:

- Did retrieval find the right chapter section?
- Did the answer use only retrieved content?
- Did the answer avoid unsupported claims?
- Is the Hinglish simple enough for Class 10?
- Are sources included?
