import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timeline, teaserTimeline, FPS, TOTAL_FRAMES} from '../src/content.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('main timeline is contiguous and lasts exactly 75 seconds', () => {
  let end = 0;
  const ids = new Set();
  for (const cut of timeline) {
    assert.equal(cut.from, end, `gap or overlap before ${cut.id}`);
    assert(cut.duration > 20, 'scene must contain more than transition frames');
    assert(!ids.has(cut.id)); ids.add(cut.id);
    end += cut.duration;
  }
  assert.equal(end, TOTAL_FRAMES);
  assert.equal(end / FPS, 75);
});

test('teaser is contiguous, references valid scene ranges and holds CTA for at least five seconds', () => {
  let end = 0;
  for (const cut of teaserTimeline) {
    const source = timeline.find(s => s.id === cut.id);
    assert(source);
    assert.equal(cut.from, end);
    assert(cut.offset >= 0 && cut.offset + cut.duration <= source.duration);
    end += cut.duration;
  }
  assert.equal(end / FPS, 25);
  assert(teaserTimeline.at(-1).duration - 30 >= 5 * FPS);
});

test('all shipped visual, font and music assets are local and nonempty', () => {
  for (const asset of ['branding/yana-mark.svg', 'stills/studio-workspace.png', 'stills/studio-home.png', 'fonts/nunito-400.ttf', 'fonts/nunito-700.ttf', 'fonts/nunito-900.ttf', 'fonts/patrick-hand.ttf', 'fonts/nunito-OFL.txt', 'fonts/patrickhand-OFL.txt', 'audio/main.mp3', 'audio/teaser.mp3']) {
    assert(fs.statSync(path.join(root, 'public', asset)).size > 100, asset);
  }
});

test('original audio score matches composition durations in stereo PCM', () => {
  for (const [name, seconds] of [['main', 75], ['teaser', 25]]) {
    const data = fs.readFileSync(path.join(root, 'public/audio', `${name}.wav`));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.readUInt16LE(22), 2);
    assert.equal(data.readUInt32LE(24), 44100);
    assert.equal(data.readUInt32LE(40) / (44100 * 4), seconds);
  }
});
