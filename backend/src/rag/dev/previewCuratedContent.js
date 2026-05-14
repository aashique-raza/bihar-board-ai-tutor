import { loadCuratedMarkdownDocuments } from '../loaders/curatedMarkdownLoader.js';

const previewText = (text, length = 300) => text.replace(/\s+/g, ' ').trim().slice(0, length);

const getDisplayTitle = (metadata) =>
  metadata.title || metadata.chapter_title || metadata.chapterTitle || metadata.chapterSlug || 'Untitled';

const run = async () => {
  const documents = await loadCuratedMarkdownDocuments();

  console.log(`Total documents loaded: ${documents.length}`);

  documents.forEach((document, index) => {
    const { metadata, pageContent } = document;

    console.log('');
    console.log(`Document ${index + 1}`);
    console.log(`File path: ${metadata.filePath}`);
    console.log(`Title: ${getDisplayTitle(metadata)}`);
    console.log(`Subject: ${metadata.subject || 'N/A'}`);
    console.log(`Class level: ${metadata.classLevel || metadata.class || 'N/A'}`);
    console.log(`Chapter slug: ${metadata.chapterSlug || 'N/A'}`);
    console.log(`Content preview: ${previewText(pageContent)}`);
  });
};

run().catch((error) => {
  console.error('Failed to preview curated content.');
  console.error(error);
  process.exit(1);
});
