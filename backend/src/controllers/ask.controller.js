import { askQuestion } from '../services/ask.service.js';
import { sendResponse } from '../utils/sendResponse.js';

export const askQuestionController = async (req, res, next) => {
  try {
    const answerPayload = await askQuestion(req.body);

    return sendResponse(res, 200, {
      message: 'Question processed successfully.',
      data: answerPayload,
    });
  } catch (error) {
    return next(error);
  }
};
