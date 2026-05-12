# DECISIONS.md

## Decision Log

### D001: Start Narrow

Decision: Start with Class 10 Science only, and only 2 chapters.

Reason: A small content set makes it easier to test retrieval quality, answer grounding, source citation, and Hinglish answer style before expanding.

Status: Accepted.

### D002: Backend Before Frontend

Decision: Build the thin RAG backend before any frontend.

Reason: The main product risk is not UI. The main risk is whether the tutor can reliably answer from source content without hallucinating.

Status: Accepted.

### D003: No Database in First Milestone

Decision: Avoid database setup in the first milestone.

Reason: Early development should focus on the pipeline. A local file-based content store and local vector store are enough for proof of concept.

Status: Accepted.

### D004: Source-Only Answers

Decision: The answer generator must use only retrieved content.

Reason: This is a board exam study tutor. Trust and correctness matter more than broad conversational ability.

Status: Accepted.

### D005: Hinglish Output

Decision: Final answers should be in simple Hinglish even if the source content is Hindi.

Reason: Many students are comfortable asking in Hindi/Hinglish, and simple Hinglish can make Science explanations easier to understand.

Status: Accepted.

### D006: Refuse When Content Is Insufficient

Decision: If retrieval does not provide enough information, the tutor should say it cannot answer from the available material.

Reason: A transparent refusal is better than a confident unsupported answer.

Status: Accepted.

### D007: Sources Required

Decision: Every answer should include source references.

Reason: Sources help students trust the answer and help developers debug retrieval quality.

Status: Accepted.
