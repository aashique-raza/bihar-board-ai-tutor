import { askQuestion } from '../ask/askOrchestrator.js';
import { sendResponse } from '../utils/sendResponse.js';

export const askQuestionController = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const guestId = req.user ? null : (req.headers['x-guest-id'] || null);

    let streamStarted = false;
    const streamCallbacks = {
      onStreamStart: () => {
        streamStarted = true;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.flushHeaders();
      },
      onToken: (chunk) => {
        if (streamStarted) {
          res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
        }
      },
      onComplete: (finalPayload) => {
        if (streamStarted) {
          res.write(`data: ${JSON.stringify({ event: 'end', payload: finalPayload })}\n\n`);
          res.end();
        }
      }
    };

    const answerPayload = await askQuestion(req.body, { userId, guestId }, streamCallbacks);

    if (streamStarted) {
      return;
    }

    return sendResponse(res, 200, {
      message: 'Question processed successfully.',
      data: answerPayload,
    });
  } catch (error) {
    return next(error);
  }
};
