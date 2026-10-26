import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// An original, deterministic arrangement; no sampled commercial recordings.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rate = 44100;
const beat = 60 / 112;
const midi = n => 440 * 2 ** ((n - 69) / 12);
let seed = 20261024;
const noise = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;

function compose(seconds, name, boundaries) {
  const size = Math.round(seconds * rate);
  const left = new Float32Array(size);
  const right = new Float32Array(size);
  const add = (at, duration, sample, gain = 1, pan = 0) => {
    const start = Math.round(at * rate);
    const count = Math.min(Math.round(duration * rate), size - start);
    for (let i = 0; i < count; i++) {
      const value = sample(i / rate, i) * gain;
      left[start + i] += value * Math.sqrt((1 - pan) / 2);
      right[start + i] += value * Math.sqrt((1 + pan) / 2);
    }
  };
  const pluck = (note, at, gain, pan) => {
    const freq = midi(note);
    add(at, 1.5, t => {
      const a = Math.min(1, t / 0.006) * Math.exp(-t * 4.5);
      return a * (Math.sin(t * freq * Math.PI * 2) + 0.25 * Math.sin(t * freq * Math.PI * 4) * Math.exp(-t * 4) + 0.09 * Math.sin(t * freq * Math.PI * 6));
    }, gain, pan);
    // Quiet stereo echo gives the pluck a little space without muddying UI cues.
    add(at + beat * 0.75, 1, t => Math.sin(t * freq * Math.PI * 2) * Math.min(1, t / 0.01) * Math.exp(-t * 6), gain * 0.16, -pan);
  };
  const chords = [[50, 57, 61, 66], [47, 54, 57, 62], [43, 50, 54, 59], [45, 52, 57, 62]];
  for (let bar = 0; bar * beat * 4 < seconds; bar++) {
    const at = bar * beat * 4;
    const chord = chords[bar % chords.length];
    chord.forEach((note, j) => {
      const freq = midi(note + 12);
      add(at, beat * 4.5, t => {
        const env = Math.min(1, t / 0.28) * Math.max(0, 1 - t / (beat * 4.5));
        return env * (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 1.002 * t));
      }, 0.038, (j - 1.5) * 0.25);
    });
    for (let step = 0; step < 8; step++) {
      const note = chord[[1, 2, 3, 2, 0, 2, 3, 1][step]] + 24;
      if ((bar % 4 !== 3 || step < 6) && !(at > 23 && at < 37 && step % 2)) {
        pluck(note, at + step * beat / 2, step % 2 ? 0.065 : 0.09, step % 2 ? 0.34 : -0.34);
      }
    }
    for (let b = 0; b < 4; b++) {
      const time = at + b * beat;
      const freq = midi(chord[0] - 12);
      add(time, beat * 0.75, t => Math.sin(2 * Math.PI * freq * t) * Math.min(1, t / 0.009) * Math.exp(-t * 6), 0.17);
      add(time, 0.25, t => Math.sin(2 * Math.PI * (46 * t + 4 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 22), 0.21);
      if (b % 2) add(time, 0.12, t => noise() * Math.exp(-t * 42), 0.07, 0.1);
      for (let h = 0; h < 2; h++) {
        let prev = 0;
        add(time + h * beat / 2, 0.05, t => {const n = noise(); const high = n - prev; prev = n; return high * Math.exp(-t * 90);}, h ? 0.025 : 0.035, h ? 0.45 : -0.45);
      }
    }
  }
  for (const at of boundaries) {
    pluck(86, Math.max(0, at), 0.13, 0.1);
    add(Math.max(0, at - 0.25), 0.45, t => noise() * Math.sin(Math.PI * t / 0.45) ** 2, 0.022, 0.2);
  }
  // One restrained click at the illustrative approval decision.
  add(name === 'main' ? 32.5 : 15, 0.075, t => Math.sin(t * Math.PI * 1800) * Math.exp(-t * 75), 0.12);
  const data = Buffer.alloc(44 + size * 4);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(size * 4, 40);
  for (let i = 0; i < size; i++) {
    const t = i / rate;
    const fade = Math.min(1, t / 0.12, (seconds - t) / 1.8);
    const duck = name === 'main' && t > 23 && t < 37 ? 0.74 : 1;
    for (const [channel, samples] of [[0, left], [1, right]]) {
      const value = Math.tanh(samples[i] * 1.3) * fade * duck * 0.82;
      data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * 32767))), 44 + i * 4 + channel * 2);
    }
  }
  const file = path.join(root, 'public', 'audio', `${name}.wav`);
  fs.writeFileSync(file, data);
  console.log(`Original score: ${name}, ${seconds}s, stereo ${rate}Hz`);
}

compose(75, 'main', [5, 12, 23, 37, 47, 57, 67]);
compose(25, 'teaser', [4, 9, 18]);
