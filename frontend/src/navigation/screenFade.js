/** Same length as the fade when a tab icon is tapped. */
export const SCREEN_FADE_MS = 420;

/** Stack screens. The main tabs keep their own swipe and icon fade. */
export const fadeStackScreenOptions = {
  headerShown: false,
  animation: 'fade',
  animationDuration: SCREEN_FADE_MS,
};
