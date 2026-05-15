import { loadCuratedMarkdownDocuments } from '../loaders/curatedMarkdownLoader.js';

const requiredMetadata = ['title', 'subject', 'classLevel', 'chapterSlug', 'sourceType'];
const hasHeading = (content) => /^#{1,6}\s+.+$/m.test(content);

const run = async () => {
  const documents = await loadCuratedMarkdownDocuments();
  const failures = [];
  const seenKeys = new Map();

  if (documents.length === 0) {
    failures.push('No curated Markdown documents were loaded.');
  }

  documents.forEach((document) => {
    const { metadata, pageContent } = document;
    const source = metadata.filePath || metadata.source || 'unknown';

    if (!pageContent.trim()) {
      failures.push(`${source}: pageContent is empty.`);
    }

    requiredMetadata.forEach((key) => {
      if (!metadata[key]) {
        failures.push(`${source}: missing required metadata "${key}".`);
      }
    });

    if (!hasHeading(pageContent)) {
      failures.push(`${source}: no Markdown heading found.`);
    }

    const duplicateKey = `${metadata.subject}::${metadata.classLevel}::${metadata.chapterSlug}`;
    const existingSource = seenKeys.get(duplicateKey);

    if (existingSource) {
      failures.push(`${source}: duplicate subject/classLevel/chapterSlug also used by ${existingSource}.`);
    } else {
      seenKeys.set(duplicateKey, source);
    }
  });

  console.log(`Documents checked: ${documents.length}`);

  if (failures.length > 0) {
    console.log('Validation result: FAIL');
    failures.forEach((failure) => console.log(`- ${failure}`));
    process.exit(1);
  }

  console.log('Validation result: PASS');
};

run().catch((error) => {
  console.error('Curated content validation failed unexpectedly.');
  console.error(error);
  process.exit(1);
});
