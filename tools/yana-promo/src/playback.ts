import {DESIGN_FPS, MAIN_DURATION, OUTPUT_FPS, TEASER_DURATION, bound, teaserTime} from './motion-state';

export {OUTPUT_FPS};
export const PLAYBACK_RATE = 1.5;
export const MAIN_DURATION_IN_FRAMES = Math.round(MAIN_DURATION / PLAYBACK_RATE * OUTPUT_FPS);
export const TEASER_DURATION_IN_FRAMES = Math.round(TEASER_DURATION / PLAYBACK_RATE * OUTPUT_FPS);

// Keep animation timing on its original design clock while sampling faster.
export const designFrameAt = (outputFrame: number, teaser = false) => {
  const duration = teaser ? TEASER_DURATION_IN_FRAMES : MAIN_DURATION_IN_FRAMES;
  const seconds = bound(outputFrame, 0, duration) / OUTPUT_FPS * PLAYBACK_RATE;
  return (teaser ? teaserTime(seconds) : seconds) * DESIGN_FPS;
};
