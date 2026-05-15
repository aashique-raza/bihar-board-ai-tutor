import { MarkdownTextSplitter } from '@langchain/textsplitters';

const DEFAULT_CHUNK_OPTIONS = {
  chunkSize: 1600,
  chunkOverlap: 150,
};

const findFirstHeading = (text, fallbackTitle) => {
  const heading = text.match(/^(#{1,6})\s+(.+)$/m);

  if (!heading) {
    return {
      sectionTitle: fallbackTitle || 'Untitled Section',
      sectionLevel: null,
    };
  }

  return {
    sectionTitle: heading[2].trim(),
    sectionLevel: heading[1].length,
  };
};

const getFallbackTitle = (metadata = {}) =>
  metadata.title || metadata.chapter_title || metadata.chapterTitle || metadata.chapterSlug;

const isUsefulChunk = (text) => text.replace(/[`~\-\s]/g, '').length > 0;

export const chunkMarkdownDocuments = async (documents, options = {}) => {
  const config = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options,
  };

  const splitter = new MarkdownTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });

  const chunks = [];
  let globalChunkIndex = 0;

  for (const document of documents) {
    const splitDocuments = await splitter.createDocuments(
      [document.pageContent],
      [document.metadata],
    );

    splitDocuments.forEach((splitDocument, index) => {
      const pageContent = splitDocument.pageContent.trim();

      if (!isUsefulChunk(pageContent)) {
        return;
      }

      const headingMetadata = findFirstHeading(pageContent, getFallbackTitle(document.metadata));

      chunks.push({
        pageContent,
        metadata: {
          ...document.metadata,
          ...splitDocument.metadata,
          chunkIndex: index,
          globalChunkIndex,
          chunkType: 'markdown_section',
          sectionTitle: headingMetadata.sectionTitle,
          sectionLevel: headingMetadata.sectionLevel,
          charCount: pageContent.length,
        },
      });

      globalChunkIndex += 1;
    });
  }

  return chunks;
};

export const DEFAULT_MARKDOWN_CHUNK_OPTIONS = DEFAULT_CHUNK_OPTIONS;
