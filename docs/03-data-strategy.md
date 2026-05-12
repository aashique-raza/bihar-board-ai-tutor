# Data Strategy

## Initial Content Scope

Use only 2 chapters from Bihar Board Class 10 Science for the first milestone.

The exact chapters should be chosen before implementation. Good selection criteria:

- Common exam importance.
- Clear textual explanations.
- Enough student questions to test retrieval.
- Content available in clean Hindi or bilingual format.

## Source Content

Source content can be Hindi. Do not translate the entire source before indexing unless testing shows retrieval is poor.

Preferred source properties:

- Official or approved.
- Chapter and section structure available.
- Page numbers or stable references available.
- Clean text extraction possible.

## File Organization

Suggested future structure:

```text
data/
  raw/
    class-10-science/
      chapter-01/
      chapter-02/
  processed/
  indexes/
```

Do not add these folders until implementation begins.

## Metadata

Every document and chunk should preserve metadata:

- `class`: `10`
- `subject`: `Science`
- `board`: `Bihar Board`
- `chapter_id`
- `chapter_title`
- `section_title`, if available
- `source_file`
- `page`, paragraph, or location reference if available
- `language`

## Cleaning Rules

Cleaning should improve retrieval without damaging meaning.

Keep:

- Hindi terms.
- Scientific names.
- Chemical symbols.
- Equations.
- Units.
- Numbered points.
- Definitions.

Remove or normalize:

- Repeated headers and footers.
- Page noise.
- Broken spacing.
- Duplicate lines.
- OCR artifacts when safe.

## Chunking Strategy

Start with simple chunking:

- Prefer section-aware chunks.
- Keep definitions and examples together.
- Use overlap to avoid losing context.
- Store source metadata with every chunk.

Avoid:

- Huge chunks that mix many topics.
- Tiny chunks that lose meaning.
- Chunks without source references.

## Expansion Strategy

After the first 2 chapters are reliable:

1. Add more chapters one by one.
2. Run the same evaluation questions.
3. Compare retrieval quality.
4. Only then consider a stronger content pipeline or database.
