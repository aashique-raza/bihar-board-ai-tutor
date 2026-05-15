import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCuratedMarkdownDocuments } from '../loaders/curatedMarkdownLoader.js';
import { chunkMarkdownDocuments } from '../chunkers/markdownChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const smokeRoot = path.join(repoRoot, 'data', 'curated', '_smoke-test');
const smokeClassRoot = path.join(smokeRoot, 'class-10');

const createSmokeFile = async (fileName, title) => {
  const content = `---
title: ${title}
subject: _smoke-test
classLevel: class-10
chapterSlug: ${path.basename(fileName, '.md')}
sourceType: curated_markdown
---

# ${title}

## Smoke Section

This is temporary curated content used only for a multi-file loader and chunker smoke test.
`;

  await fs.writeFile(path.join(smokeClassRoot, fileName), content, 'utf8');
};

const run = async () => {
  try {
    await fs.rm(smokeRoot, { recursive: true, force: true });
    await fs.mkdir(smokeClassRoot, { recursive: true });
    await createSmokeFile('smoke-chapter-01.md', 'Smoke Chapter 01');
    await createSmokeFile('smoke-chapter-02.md', 'Smoke Chapter 02');

    const documents = await loadCuratedMarkdownDocuments();
    const smokeDocuments = documents.filter((doc) => doc.metadata.subject === '_smoke-test');

    if (smokeDocuments.length !== 2) {
      throw new Error(`Expected 2 smoke documents, found ${smokeDocuments.length}.`);
    }

    const chunks = await chunkMarkdownDocuments(smokeDocuments);
    const chunkSources = new Set(chunks.map((chunk) => chunk.metadata.fileName));

    if (!chunkSources.has('smoke-chapter-01.md') || !chunkSources.has('smoke-chapter-02.md')) {
      throw new Error('Chunks were not created for both smoke files.');
    }

    console.log('Smoke multi-file result: PASS');
    console.log(`Smoke documents loaded: ${smokeDocuments.length}`);
    console.log(`Smoke chunks created: ${chunks.length}`);
  } catch (error) {
    console.log('Smoke multi-file result: FAIL');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  }
};

run();
