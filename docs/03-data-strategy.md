# Data Strategy

## Source Content

The first milestone uses approved Bihar Board Class 10 Science study content only.

Start with 2 verified chapters. Chapter names are TBD and must not be hardcoded before source verification.

## Input Format

Use clean `.txt` files first.

Do not start with:

- PDFs.
- OCR.
- Scanned documents.
- Images.
- Web scraping.

Clean text makes the pipeline easier to test and keeps early debugging focused on RAG behavior.

## Language

Source content may be Hindi.

The pipeline should preserve Hindi text and meaning during cleaning, chunking, and metadata creation.

Students may ask in:

- Hindi.
- Hinglish.
- Simple English.

Final answers must be simple Hinglish.

## Local Folder Plan

The later implementation may use a structure like:

```text
data/
  source/
  processed/
  vector-store/
```

This is a planning suggestion, not an instruction to create application code immediately.

## Metadata

Each source document should eventually track:

- Subject.
- Class.
- Board.
- Chapter identifier.
- Chapter title after verification.
- Source file path.
- Source type.
- Version or date added.

Each chunk should eventually track:

- Chunk ID.
- Source document ID.
- Chapter identifier.
- Section or heading if available.
- Text range or location if available.
- Original source reference.

## Content Approval

Only approved source files should enter the index.

The system should be able to rebuild the local vector store from approved source text.

## Future Data Work

Later versions may add:

- PDF ingestion.
- OCR.
- File storage.
- Content review workflows.
- Database-backed content metadata.
- Versioned content releases.

These are outside the first milestone.
