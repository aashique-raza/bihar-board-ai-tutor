import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMarkdownDocuments } from '../../rag/indexing/loaders/markdownLoader.js';
import {
  buildCurriculumIndex,
  validateCurriculumIndex,
} from './curriculumIndexBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..', '..');

export const DEFAULT_CURRICULUM_INDEX_PATH = path.resolve(
  backendRoot,
  'storage',
  'curriculum-index.json'
);

export const DEFAULT_SCIENCE_CONTENT_DIR = path.resolve(
  backendRoot,
  '..',
  'data',
  'class-10',
  'science'
);

export const createCurriculumIndexFromMarkdown = async (
  contentDir = DEFAULT_SCIENCE_CONTENT_DIR
) => {
  const documents = await loadMarkdownDocuments(contentDir);
  const curriculumIndex = buildCurriculumIndex(documents);
  const validation = validateCurriculumIndex(curriculumIndex);

  if (!validation.valid) {
    throw new Error(
      `Invalid curriculum index:\n- ${validation.errors.join('\n- ')}`
    );
  }

  return curriculumIndex;
};

export const saveCurriculumIndex = async (
  curriculumIndex,
  outputPath = DEFAULT_CURRICULUM_INDEX_PATH
) => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(curriculumIndex, null, 2)}\n`, 'utf8');

  return outputPath;
};

export const loadCurriculumIndex = async (
  indexPath = DEFAULT_CURRICULUM_INDEX_PATH
) => {
  const content = await fs.readFile(indexPath, 'utf8');
  const curriculumIndex = JSON.parse(content);
  const validation = validateCurriculumIndex(curriculumIndex);

  if (!validation.valid) {
    throw new Error(
      `Invalid curriculum index at ${indexPath}:\n- ${validation.errors.join('\n- ')}`
    );
  }

  return curriculumIndex;
};

