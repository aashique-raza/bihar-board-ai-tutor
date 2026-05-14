import { sendResponse } from '../utils/sendResponse.js';

export const getHealth = (_req, res) => {
  return sendResponse(res, 200, {
    message: 'Backend health check passed.',
    data: {
      service: 'bihar-board-ai-tutor-backend',
      status: 'ok',
    },
  });
};
