import { askQuestion } from '../ask/askOrchestrator.js';
import { sendResponse } from '../utils/sendResponse.js';

export const askQuestionController = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const answerPayload = await askQuestion(req.body, { userId });

    return sendResponse(res, 200, {
      message: 'Question processed successfully.',
      data: answerPayload,
    });
  } catch (error) {
    return next(error);
  }
};
