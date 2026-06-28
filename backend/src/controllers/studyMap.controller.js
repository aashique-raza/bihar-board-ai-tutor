import { getStudyMap } from '../services/studyMap.service.js';
import { sendResponse } from '../utils/sendResponse.js';
import { loadCurriculumIndex } from '../curriculum/curriculumIndexLoader.js';
import { getChapterCoreTopics } from '../curriculum/topicResolver.js';

export const getStudyMapController = async (_req, res, next) => {
  try {
    const studyMap = await getStudyMap();

    return sendResponse(res, 200, {
      message: 'Study map fetched successfully.',
      data: studyMap,
    });
  } catch (error) {
    return next(error);
  }
};

export const getChapterTopicsController = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const studyMap = await getStudyMap();
    
    // Find the chapter in the study map
    let foundChapter = null;
    for (const subject of studyMap.focusStudy.subjects) {
      for (const section of subject.sections) {
        const chapter = section.chapters.find((c) => c.id === chapterId);
        if (chapter) {
          foundChapter = chapter;
          break;
        }
      }
      if (foundChapter) break;
    }

    if (!foundChapter) {
      return sendResponse(res, 404, {
        message: 'Chapter not found.',
      });
    }

    const index = await loadCurriculumIndex();
    const topics = getChapterCoreTopics(index, chapterId);

    return sendResponse(res, 200, {
      message: 'Chapter topics fetched successfully.',
      data: {
        chapterId,
        topics: topics.map((t) => ({
          topicId: t.topicId,
          title: t.title,
          order: t.order,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};
