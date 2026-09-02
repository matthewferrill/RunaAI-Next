const MODES = Object.freeze({
  chat: Object.freeze(["conversation", "research", "review"]),
  code: Object.freeze(["conversation", "work"]),
});
const ANSWER_LANES = Object.freeze({
  chat: Object.freeze(["general", "research", "review"]),
  code: Object.freeze(["code"]),
});

export const FUNCTION_MODE_MATRIX = MODES;
export const ANSWER_LANE_MATRIX = ANSWER_LANES;

export function functionModeAllowed(experience, mode) {
  return MODES[experience]?.includes(mode) === true;
}

export function answerLaneAllowed(experience, lane) {
  return ANSWER_LANES[experience]?.includes(lane) === true;
}
