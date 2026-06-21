import 'dotenv/config';
import { createDocumentEmbeddings } from './src/rag/geminiEmbeddings.js';

const test = async () => {
  const embeddings = createDocumentEmbeddings();
  const res = await embeddings.embedDocuments(['hello world']);
  console.log('Result length:', res.length);
  if (res.length > 0) {
    console.log('Is array?', Array.isArray(res[0]));
    console.log('First vector length:', res[0]?.length);
  }
};
test();
