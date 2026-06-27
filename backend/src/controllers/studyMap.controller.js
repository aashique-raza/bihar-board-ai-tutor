import { getStudyMap } from '../services/studyMap.service.js';
import { sendResponse } from '../utils/sendResponse.js';

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

    // Now, we need the topics. The studyMap doesn't currently store topics directly.
    // We should get it from curriculum/curriculumBrain.js which indexes everything.
    const { getCurriculumIndex } = await import('../curriculum/curriculumBrain.js');
    const index = await getCurriculumIndex();
    
    // The index has `chapters` which is a Map or Object keyed by chapter ID
    const chapterData = index.chapters.get(chapterId);
    
    if (!chapterData || !chapterData.topics) {
       return sendResponse(res, 404, {
        message: 'Topics for this chapter not found.',
      });
    }

    // Return the topics array directly
    return sendResponse(res, 200, {
      message: 'Chapter topics fetched successfully.',
      data: {
        chapterId,
        topics: chapterData.topics.map(t => ({
          topicId: t.topicId,
          title: t.title
        }))
      },
    });
  } catch (error) {
    return next(error);
  }
};
