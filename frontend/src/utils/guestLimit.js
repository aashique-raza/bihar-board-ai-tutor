const KEY = 'zuno.guestTurns';
export const GUEST_TURN_LIMIT = 5;

export const getGuestTurnCount = () =>
  parseInt(localStorage.getItem(KEY) || '0', 10);

export const incrementGuestTurnCount = () => {
  const next = getGuestTurnCount() + 1;
  localStorage.setItem(KEY, String(next));
  return next;
};

export const resetGuestTurnCount = () => {
  localStorage.removeItem(KEY);
};

export const isGuestLimitReached = () =>
  getGuestTurnCount() >= GUEST_TURN_LIMIT;

export const setGuestTurnCountToLimit = () => {
  localStorage.setItem(KEY, String(GUEST_TURN_LIMIT));
};
