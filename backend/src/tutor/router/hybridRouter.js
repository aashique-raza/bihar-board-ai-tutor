import { routeWithLlm } from './llmRouter.js';
import { routeWithRules } from './ruleRouter.js';
import { createRoute, ROUTER_CONFIDENCE, ROUTER_INTENTS } from './routerIntents.js';

const SAFE_RULE_INTENTS = new Set([
  ROUTER_INTENTS.greeting,
  ROUTER_INTENTS.studyIntent,
  ROUTER_INTENTS.metadataQuestion,
  ROUTER_INTENTS.followUp,
  ROUTER_INTENTS.ragQuestion,
]);

const shouldUseRuleRoute = (route) =>
  route.confidence >= ROUTER_CONFIDENCE.high ||
  (route.confidence >= ROUTER_CONFIDENCE.medium && SAFE_RULE_INTENTS.has(route.intent));

export const routeMessage = async ({ normalized, sessionContext, options = {} }) => {
  const ruleRoute = routeWithRules({ normalized, sessionContext });

  if (shouldUseRuleRoute(ruleRoute)) {
    return ruleRoute;
  }

  try {
    const llmRoute = await routeWithLlm({
      normalized,
      sessionContext,
      chatModel: options.routerChatModel,
    });

    if (llmRoute.confidence < ROUTER_CONFIDENCE.medium || llmRoute.needsClarification) {
      return createRoute({
        ...llmRoute,
        intent: ROUTER_INTENTS.unclear,
        needsClarification: true,
        clarificationQuestion:
          llmRoute.clarificationQuestion ||
          'Mujhe clear nahi hua. Aap topic ka naam ya chapter thoda clearly likh do.',
      });
    }

    return llmRoute;
  } catch (error) {
    if (ruleRoute.intent === ROUTER_INTENTS.ragQuestion) {
      return {
        ...ruleRoute,
        reason: `${ruleRoute.reason} LLM router unavailable: ${error.message}`,
      };
    }

    return createRoute({
      intent: ROUTER_INTENTS.unclear,
      confidence: 0.3,
      source: 'fallback',
      subjectHint: normalized.subjectHint,
      sectionHint: normalized.sectionHint,
      needsClarification: true,
      clarificationQuestion:
        'Mujhe clear nahi hua. Aap topic ka naam ya chapter thoda clearly likh do.',
      reason: `Router fallback used: ${error.message}`,
    });
  }
};
