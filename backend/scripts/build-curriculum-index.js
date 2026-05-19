import {
  createCurriculumIndexFromMarkdown,
  DEFAULT_CURRICULUM_INDEX_PATH,
  saveCurriculumIndex,
} from '../src/tutor/curriculum/curriculumIndexStore.js';
import { createCurriculumTopicDocuments } from '../src/tutor/curriculum/curriculumIndexBuilder.js';

const summarizeIndex = (curriculumIndex) => {
  const summary = {
    subjects: curriculumIndex.subjects.length,
    sections: 0,
    chapters: 0,
    topics: 0,
    langChainTopicDocuments: 0,
  };

  for (const subject of curriculumIndex.subjects) {
    summary.sections += subject.sections.length;

    for (const section of subject.sections) {
      summary.chapters += section.chapters.length;

      for (const chapter of section.chapters) {
        summary.topics += chapter.topics.length;
      }
    }
  }

  summary.langChainTopicDocuments =
    createCurriculumTopicDocuments(curriculumIndex).length;

  return summary;
};

try {
  const curriculumIndex = await createCurriculumIndexFromMarkdown();
  const outputPath = await saveCurriculumIndex(
    curriculumIndex,
    DEFAULT_CURRICULUM_INDEX_PATH
  );

  console.log('Curriculum index built successfully.');
  console.log(`Output: ${outputPath}`);
  console.log(JSON.stringify(summarizeIndex(curriculumIndex), null, 2));
} catch (error) {
  console.error(`Failed to build curriculum index: ${error.message}`);
  process.exitCode = 1;
}

