import { loadCuratedMarkdownDocuments } from '../loaders/curatedMarkdownLoader.js';
import {
  chunkMarkdownDocuments,
  DEFAULT_MARKDOWN_CHUNK_OPTIONS,
} from '../chunkers/markdownChunker.js';

const previewText = (text, length = 300) => text.replace(/\s+/g, ' ').trim().slice(0, length);

const getChapterTitle = (metadata) =>
  metadata.title || metadata.chapter_title || metadata.chapterTitle || metadata.chapterSlug || 'Untitled';

const countChunksBySource = (chunks) =>
  chunks.reduce((counts, chunk) => {
    const source = chunk.metadata.filePath || chunk.metadata.source || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});

const run = async () => {
  const documents = await loadCuratedMarkdownDocuments();
  const chunks = await chunkMarkdownDocuments(documents);
  const sourceCounts = countChunksBySource(chunks);

  console.log(`Source documents loaded: ${documents.length}`);
  console.log(`Total chunks created: ${chunks.length}`);
  console.log(
    `Chunk config: size=${DEFAULT_MARKDOWN_CHUNK_OPTIONS.chunkSize}, overlap=${DEFAULT_MARKDOWN_CHUNK_OPTIONS.chunkOverlap}`,
  );
  console.log('Chunk count per source file:');

  Object.entries(sourceCounts).forEach(([source, count]) => {
    console.log(`- ${source}: ${count}`);
  });

  chunks.forEach((chunk, index) => {
    const { metadata, pageContent } = chunk;

    console.log('');
    console.log(`Chunk ${index + 1}`);
    console.log(`Source file: ${metadata.filePath || metadata.source || 'N/A'}`);
    console.log(`Chapter title: ${getChapterTitle(metadata)}`);
    console.log(`Section title: ${metadata.sectionTitle}`);
    console.log(`Section level: ${metadata.sectionLevel ?? 'N/A'}`);
    console.log(`Char count: ${metadata.charCount}`);
    console.log(`Preview: ${previewText(pageContent)}`);
  });
};

run().catch((error) => {
  console.error('Failed to preview chunks.');
  console.error(error);
  process.exit(1);
});
