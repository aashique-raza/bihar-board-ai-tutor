import path from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import { DirectoryLoader } from '@langchain/classic/document_loaders/fs/directory';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

// Path setup: backend/src/rag/loaders -> repo root -> data/curated.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultCuratedRoot = path.join(repoRoot, 'data', 'curated');

// Fallback metadata comes from data/curated/<subject>/<classLevel>/<file>.md.
const inferMetadataFromPath = (sourcePath, curatedRoot) => {
  const relativeToCurated = path.relative(curatedRoot, sourcePath);
  const parts = relativeToCurated.split(path.sep);
  const fileName = path.basename(sourcePath);

  return {
    subject: parts[0] || undefined,
    classLevel: parts[1] || undefined,
    chapterSlug: path.basename(fileName, path.extname(fileName)),
  };
};

const normalizePath = (filePath) => filePath.replaceAll(path.sep, '/');

export const loadCuratedMarkdownDocuments = async (options = {}) => {
  const curatedRoot = options.curatedRoot || defaultCuratedRoot;

  // DirectoryLoader handles recursive file discovery; TextLoader reads .md files.
  const loader = new DirectoryLoader(curatedRoot, {
    '.md': (filePath) => new TextLoader(filePath),
  });

  let loadedDocs = [];

  try {
    loadedDocs = await loader.load();
  } catch (error) {
    console.warn(`Could not load curated Markdown folder: ${curatedRoot}`);
    console.warn(error.message);
    return [];
  }

  if (loadedDocs.length === 0) {
    console.warn(`No Markdown files found under: ${curatedRoot}`);
    return [];
  }

  return loadedDocs
    .sort((left, right) => left.metadata.source.localeCompare(right.metadata.source))
    .map((doc) => {
    const sourcePath = doc.metadata.source;
    const parsed = matter(doc.pageContent);
    const pathMetadata = inferMetadataFromPath(sourcePath, curatedRoot);
    const relativeFilePath = normalizePath(path.relative(repoRoot, sourcePath));
    const frontmatterMetadata = {
      ...parsed.data,
      title: parsed.data.title || parsed.data.chapter_title || parsed.data.chapterTitle,
    };

    return {
      pageContent: parsed.content.trim(),
      metadata: {
        sourceType: 'curated_markdown',
        source: relativeFilePath,
        filePath: relativeFilePath,
        fileName: path.basename(sourcePath),
        ...pathMetadata,
        ...frontmatterMetadata,
      },
    };
  });
};
