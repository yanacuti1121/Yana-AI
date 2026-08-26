'use strict';

// Thin wrapper around opusscript (pure JS/WASM libopus port, no native
// build step — chosen deliberately over @discordjs/opus so Railway's
// Docker build doesn't need node-gyp/build-essential for this one small
// feature; see the plan's "Open decisions" note for the vetting tradeoff).
// Keeps the codec library swappable without touching robot.js.
const OpusScript = require('opusscript');

// Bytes per PCM sample (16-bit signed, matching what the firmware/opus
// encoder on the ESP32 side and Opus itself both use).
const BYTES_PER_SAMPLE = 2;

function createDecoder(sampleRate, channels) {
  const codec = new OpusScript(sampleRate, channels, OpusScript.Application.VOIP);
  return {
    // frame: Buffer (one Opus packet). Returns a Buffer of interleaved
    // 16-bit PCM samples.
    decodeFrame(frame) {
      return codec.decode(frame);
    },
    dispose() {
      codec.delete();
    },
  };
}

function createEncoder(sampleRate, channels, frameDurationMs) {
  const codec = new OpusScript(sampleRate, channels, OpusScript.Application.AUDIO);
  const frameSize = (sampleRate * frameDurationMs) / 1000;
  const frameBytes = frameSize * channels * BYTES_PER_SAMPLE;
  let pending = Buffer.alloc(0);

  function pushPcm(pcm, final = false) {
    if (!Buffer.isBuffer(pcm)) pcm = Buffer.from(pcm);
    if (pcm.length) pending = pending.length ? Buffer.concat([pending, pcm]) : pcm;

    const frames = [];
    while (pending.length >= frameBytes) {
      frames.push(codec.encode(pending.subarray(0, frameBytes), frameSize));
      pending = pending.subarray(frameBytes);
    }
    if (final && pending.length) {
      const padded = Buffer.alloc(frameBytes);
      pending.copy(padded);
      frames.push(codec.encode(padded, frameSize));
      pending = Buffer.alloc(0);
    }
    return frames;
  }

  return {
    // pcm: Buffer of interleaved 16-bit PCM samples, any length. Returns
    // an array of Opus packet Buffers, one per frameDurationMs chunk
    // (the last chunk is zero-padded if shorter than a full frame).
    encodePcm(pcm) {
      return pushPcm(pcm, true);
    },
    // Incremental form for a streaming PCM response. Incomplete samples stay
    // buffered until a complete Opus frame is available; pass final=true once
    // to zero-pad only the final frame.
    pushPcm,
    finish() {
      return pushPcm(Buffer.alloc(0), true);
    },
    dispose() {
      codec.delete();
    },
  };
}

// Wraps raw 16-bit PCM in a minimal WAV (RIFF) header so it can be
// uploaded to an ASR API that expects a standard audio file (Groq's
// /openai/v1/audio/transcriptions accepts "wav" per its docs).
function pcmToWav(pcm, sampleRate, channels) {
  const byteRate = sampleRate * channels * BYTES_PER_SAMPLE;
  const blockAlign = channels * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);        // fmt chunk size
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

module.exports = { createDecoder, createEncoder, pcmToWav };
