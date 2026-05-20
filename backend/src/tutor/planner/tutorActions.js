export const TUTOR_ACTIONS = {
  respondSmalltalk: 'respond_smalltalk',
  setLearningTarget: 'set_learning_target',
  answerMetadata: 'answer_metadata',
  startLesson: 'start_lesson',
  continueLesson: 'continue_lesson',
  answerDoubt: 'answer_doubt',
  askClarification: 'ask_clarification',
  refuseOutOfScope: 'refuse_out_of_scope',
};

export const TUTOR_ACTION_VALUES = new Set(Object.values(TUTOR_ACTIONS));
