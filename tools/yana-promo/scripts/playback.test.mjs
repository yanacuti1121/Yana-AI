import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Node's native TypeScript loader needs an extension; Remotion uses bundler resolution.
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './motion-state' && context.parentURL?.endsWith('/src/playback.ts')) {
      return nextResolve('./motion-state.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
const {PLAYBACK_RATE, OUTPUT_FPS, MAIN_DURATION_IN_FRAMES, TEASER_DURATION_IN_FRAMES, designFrameAt} = await import('../src/playback.ts');
hook.deregister();

test('playback runs at 1.5x with exact 60fps composition lengths', () => {
  assert.equal(PLAYBACK_RATE, 1.5);
  assert.equal(OUTPUT_FPS, 60);
  assert.equal(MAIN_DURATION_IN_FRAMES, 3000);
  assert.equal(TEASER_DURATION_IN_FRAMES, 1000);
  assert.equal(MAIN_DURATION_IN_FRAMES / OUTPUT_FPS, 50);
  assert.equal(TEASER_DURATION_IN_FRAMES / OUTPUT_FPS, 25 / 1.5);
});

test('main playback advances three quarters of a design frame per output frame', () => {
  assert.equal(designFrameAt(0), 0);
  assert.equal(designFrameAt(1), 0.75);
  assert.equal(designFrameAt(60), 45);
  assert.equal(designFrameAt(150), 112.5);
  assert.equal(designFrameAt(2999), 2249.25);
  assert.equal(designFrameAt(3000), 2250);
});

test('teaser preserves source cuts at accelerated output boundaries', () => {
  for (const [frame, before, after] of [[150, 111.75, 337.5], [350, 486.75, 750], [600, 936.75, 1312.5], [800, 1461.75, 2100]]) {
    assert(Math.abs(designFrameAt(frame - 1, true) - before) < 1e-9);
    assert(Math.abs(designFrameAt(frame, true) - after) < 1e-9);
  }
  assert.equal(designFrameAt(999, true), 2249.25);
  assert.equal(designFrameAt(1000, true), 2250);
});

test('both timelines clamp frames to their source bounds', () => {
  for (const teaser of [false, true]) {
    assert.equal(designFrameAt(-1, teaser), 0);
    assert.equal(designFrameAt(-Infinity, teaser), 0);
    assert.equal(designFrameAt(Infinity, teaser), 2250);
    assert.equal(designFrameAt(100000, teaser), 2250);
  }
});
