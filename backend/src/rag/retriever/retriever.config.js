import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const backendRoot = path.resolve(__dirname, '..', '..', '..');

export const retrieverConfig = {
  vectorStorePath: path.resolve(backendRoot, 'storage', 'vector-store.json'),
  defaultTopK: 5,
  defaultMinScore: 0.55,
  expectedEmbeddingDimension: 3072,
};

