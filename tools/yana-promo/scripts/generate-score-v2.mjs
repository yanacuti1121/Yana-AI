import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clicks, BPM} from '../src/motion-state.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sr = 44100, beat = 60 / BPM;
const hz = n => 440 * 2 ** ((n - 69) / 12);
let seed = 74432;
const noise = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function score(duration, name, uiClicks) {
  const n = Math.round(duration * sr), l = new Float32Array(n), r = new Float32Array(n);
  const add = (at, length, fn, gain = 1, pan = 0) => {
    const start = Math.max(0, Math.round(at * sr)), count = Math.min(Math.round(length * sr), n - start);
    for (let i = 0; i < count; i++) {const v = fn(i / sr, i) * gain;l[start + i] += v * Math.sqrt((1 - pan) / 2);r[start + i] += v * Math.sqrt((1 + pan) / 2);}
  };
  const kick = at => add(at, 0.33, t => (Math.sin(2 * Math.PI * (47 * t + 5.2 * (1 - Math.exp(-34 * t)))) * Math.exp(-t * 15) + noise() * Math.exp(-t * 170) * 0.12), 0.5);
  const hat = (at, open = false, pan = 0.3) => {let prev = 0;add(at, open ? 0.19 : 0.045, t => {const v = noise(), hp = v - prev;prev = v;return hp * Math.exp(-t * (open ? 27 : 110));}, open ? 0.045 : 0.029, pan);};
  const clap = at => {
    let low = 0;
    add(at, 0.18, t => {const v = noise();low += (v - low) * 0.3;const env = Math.exp(-t * 25) * (0.55 + 0.45 * Math.cos(t * 2 * Math.PI * 90) ** 8);return (v - low) * env;}, 0.17, -0.06);
    add(at, 0.13, t => Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 34), 0.05);
  };
  const synth = (at, note, length, gain, pan = 0) => {
    const freq = hz(note);let filtered = 0;
    add(at, length + 0.06, t => {
      const env = Math.min(1, t / 0.004) * Math.exp(-t * 5) * Math.min(1, Math.max(0, length + 0.06 - t) / 0.06);
      const bright = Math.sin(2 * Math.PI * freq * t) + 0.32 * Math.sin(4 * Math.PI * freq * t) + 0.14 * Math.sin(6 * Math.PI * freq * t) + 0.06 * Math.sin(8 * Math.PI * freq * t);
      filtered += (bright - filtered) * 0.35;
      return filtered * env;
    }, gain, pan);
  };
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 60, 64, 67], [55, 59, 62, 67]];
  for (let bar = 0; bar * 4 * beat < duration; bar++) {
    const at = bar * 4 * beat, notes = chords[bar % 4];
    const intro = bar < 2;
    const breakDown = name === 'main-v2' && bar >= 12 && bar < 16;
    const final = at > duration - 5;
    for (let b = 0; b < 4; b++) {
      const time = at + b * beat;
      if (!intro || b % 2 === 0) kick(time);
      if (b % 2 && !breakDown) clap(time);
      for (let h = 0; h < (intro ? 2 : 4); h++) hat(time + h * beat / (intro ? 2 : 4), h === 2 && !intro, h % 2 ? -0.35 : 0.35);
    }
    if (!final) {
      // Syncopated bass and short chord stabs, rather than a lullaby-like arpeggio.
      for (const [pos, offset] of [[0, 0], [0.75, 0], [1.5, 7], [2, 0], [2.75, 12], [3.5, 7]]) {
        if (breakDown && pos !== 0 && pos !== 2) continue;
        const freq = hz(notes[0] - 24 + offset);
        add(at + pos * beat, beat * 0.4, t => Math.tanh((Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)) * 1.5) * Math.min(1, t / 0.004) * Math.exp(-t * 15), breakDown ? 0.08 : 0.17);
      }
      for (const pos of (breakDown ? [0.5, 2.5] : [0.5, 1.75, 2.5, 3.25])) {
        notes.forEach((note, j) => synth(at + pos * beat, note + 12, beat * 0.34, intro ? 0.018 : 0.027, (j - 1.5) * 0.27));
      }
      if (bar % 4 === 2 && !breakDown) {
        [76, 79, 81, 79, 74, 76].forEach((note, i) => synth(at + (i * 0.5 + 0.25) * beat, note, beat * 0.25, 0.065, i % 2 ? 0.25 : -0.25));
      }
    }
    if (bar % 4 === 3 && !intro && !final) for (let i = 0; i < 4; i++) clap(at + (3 + i / 4) * beat);
  }
  const boundaries = name === 'main-v2' ? [3.75, 11.25, 22.5, 33.75, 41.25, 52.5, 63.75, 68.75] : [3.75, 8.75, 15, 20];
  for (const at of boundaries) {
    let prev = 0;
    add(Math.max(0, at - 0.28), 0.38, t => {const v = noise();prev += (v - prev) * (0.04 + t * 0.15);return prev * Math.sin(Math.PI * t / 0.38) ** 2;}, 0.11, 0.25);
    synth(at, 88, 0.15, 0.055, -0.3);
  }
  for (const at of uiClicks) {
    add(at, 0.035, t => (Math.sin(2 * Math.PI * 1150 * t) * 0.6 + noise() * 0.4) * Math.exp(-t * 160), 0.09, 0.2);
  }
  const typingRanges = name === 'main-v2' ? [[11.4, 13.5], [15.2, 18.3], [22.7, 24.5], [44.3, 45.3], [53.5, 54.3], [55.6, 56]] : [[3.8, 6], [9, 10.5], [15.5, 16.5]];
  for (const [a, b] of typingRanges) for (let at = a; at < b; at += 0.11) add(at, 0.018, t => noise() * Math.exp(-t * 230), 0.035, 0.4);
  const data = Buffer.alloc(44 + n * 4);data.write('RIFF');data.writeUInt32LE(data.length - 8, 4);data.write('WAVEfmt ', 8);data.writeUInt32LE(16, 16);data.writeUInt16LE(1, 20);data.writeUInt16LE(2, 22);data.writeUInt32LE(sr, 24);data.writeUInt32LE(sr * 4, 28);data.writeUInt16LE(4, 32);data.writeUInt16LE(16, 34);data.write('data', 36);data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const time = i / sr, fade = Math.min(1, time / 0.04, (duration - time) / 0.9);
    for (const [ch, channel] of [[0, l], [1, r]]) data.writeInt16LE(Math.round(Math.tanh(channel[i] * 1.6) * 0.8 * fade * 32767), 44 + i * 4 + ch * 2);
  }
  fs.writeFileSync(path.join(root, 'public/audio', `${name}.wav`), data);
  console.log(`${name}: original ${BPM} BPM groove, ${duration}s, click/typing/transition cues included`);
}
score(75, 'main-v2', clicks.map(f => f / 30));
score(25, 'teaser-v2', [3.9, 6.7, 10.1, 13.75, 15.3, 17.2, 18.9]);
