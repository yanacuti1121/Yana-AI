'use strict';

const assert = require('assert');
const opus = require('./lib/opus-codec');

const sampleRate = 24000;
const channels = 1;
const frameMs = 60;
const frameBytes = (sampleRate * frameMs * channels * 2) / 1000;
const pcm = Buffer.alloc(frameBytes * 2 + 318);
for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE((i * 17) % 32767, i);

const whole = opus.createEncoder(sampleRate, channels, frameMs);
const expected = whole.encodePcm(pcm);
whole.dispose();

const streamed = opus.createEncoder(sampleRate, channels, frameMs);
const actual = [
  ...streamed.pushPcm(pcm.subarray(0, 101)),
  ...streamed.pushPcm(pcm.subarray(101, frameBytes + 33)),
  ...streamed.pushPcm(pcm.subarray(frameBytes + 33)),
  ...streamed.finish(),
];
streamed.dispose();

assert.strictEqual(actual.length, 3, 'streaming encoder must emit two full frames and one padded frame');
assert.strictEqual(actual.length, expected.length);
for (let i = 0; i < expected.length; i++) assert.deepStrictEqual(actual[i], expected[i]);

console.log('Opus incremental encoder test passed.');
