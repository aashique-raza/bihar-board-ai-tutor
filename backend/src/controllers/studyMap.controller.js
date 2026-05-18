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
