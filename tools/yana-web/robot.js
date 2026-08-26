'use strict';

// Robot voice/MCP bridge — lets an ESP32 yana-wheelbot device (or any
// XiaoZhi-protocol-compatible board) use this server as its voice AI
// backend instead of xiaozhi.me or a self-hosted XiaoZhi server.
//
// Speaks the exact protocol documented in the yana-robot firmware repo's
// docs/websocket.md + docs/mcp-protocol.md: this module is the WebSocket
// server the device connects to, and it acts as the MCP *client* (the
// device is the MCP *server* — it owns the tools; see mcp-protocol.md).
// No firmware changes are required — only the device's `ota_url`/server
// setting needs to point here instead of the default backend.
//
// Kept in its own file (this module, not mixed into server.js's chat/
// agent code) per the memory.js/missions.js/auth.js pattern already used
// in this file — see server.js's own top-of-file requires.

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { PROVIDERS, connectToProvider } = require('./lib/providers');
const opus = require('./lib/opus-codec');

const ROBOT_WS_PATH = process.env.YANA_ROBOT_WS_PATH || '/robot/ws';
const ROBOT_DEVICE_TOKEN = process.env.YANA_ROBOT_DEVICE_TOKEN || '';
const ROBOT_LLM_API_KEY = process.env.YANA_ROBOT_LLM_API_KEY || '';
const ROBOT_LLM_PROVIDER = process.env.YANA_ROBOT_LLM_PROVIDER || 'groq';
const ROBOT_LLM_MODEL =
  process.env.YANA_ROBOT_LLM_MODEL || PROVIDERS[ROBOT_LLM_PROVIDER]?.defaultModel;

// Groq's OpenAI-compatible ASR endpoint (confirmed against Groq's own docs
// at design time: https://api.groq.com/openai/v1/audio/transcriptions,
// accepts wav, model whisper-large-v3-turbo). Uses the SAME
// YANA_ROBOT_LLM_API_KEY as chat when ROBOT_LLM_PROVIDER is "groq" — one
// key covers both, no second provider needed.
const ASR_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const ASR_MODEL = process.env.YANA_ROBOT_ASR_MODEL || 'whisper-large-v3-turbo';

// TTS provider: "vieneu" (default, local, free, Vietnamese/English only) or
// "openai" (cloud, needs YANA_ROBOT_TTS_API_KEY, multilingual -- confirmed
// against OpenAI's own docs at design time: Whisper-language-list coverage
// including Korean, though voices are English-optimized so quality varies
// by language). Pick "openai" for languages VieNeu-TTS can't produce.
const TTS_PROVIDER = process.env.YANA_ROBOT_TTS_PROVIDER || 'vieneu';
const TTS_API_KEY = process.env.YANA_ROBOT_TTS_API_KEY || ROBOT_LLM_API_KEY;
const TTS_OPENAI_MODEL = process.env.YANA_ROBOT_TTS_OPENAI_MODEL || 'gpt-4o-mini-tts';
const TTS_OPENAI_VOICE = process.env.YANA_ROBOT_TTS_OPENAI_VOICE || 'alloy';
const TTS_OPENAI_URL = 'https://api.openai.com/v1/audio/speech';

// Same sidecar server.js's handleTts() already proxies to
// (tools/yana-web/tts-sidecar/, VieNeu-TTS). Duplicated here (not shared)
// because handleTts() is wired directly to an HTTP req/res pair for browser
// WAV playback, while the robot consumes the sidecar's raw 24 kHz PCM stream.
const TTS_SIDECAR_PORT = Number(process.env.VIENEU_SIDECAR_PORT) || 7861;
const TTS_SAMPLE_RATE = 24000; // matches docs/websocket.md's note that the
const TTS_CHANNELS = 1; // server may use 24kHz on the downlink
const TTS_FRAME_MS = 60;
// Firmware accepts about 1.2 seconds of queued Opus. Pace packets close to
// real time so fast ONNX generation cannot overflow that queue and drop audio.
const configuredTtsPacketInterval = Number(process.env.YANA_ROBOT_TTS_PACKET_INTERVAL_MS);
const TTS_PACKET_INTERVAL_MS =
  process.env.YANA_ROBOT_TTS_PACKET_INTERVAL_MS == null || !Number.isFinite(configuredTtsPacketInterval)
    ? 55
    : Math.max(0, configuredTtsPacketInterval);
const TTS_START_DELAY_MS = 60;

const MCP_TIMEOUT_MS = 8000;

function attach(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_) {
      socket.destroy();
      return;
    }
    if (pathname !== ROBOT_WS_PATH) {
      return; // not ours; no other upgrade handler exists today, so this is safe to ignore
    }

    if (ROBOT_DEVICE_TOKEN) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (token !== ROBOT_DEVICE_TOKEN) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', ws => new RobotSession(ws));

  console.log(`[robot] WebSocket bridge attached at ${ROBOT_WS_PATH}`);
}

class RobotSession {
  constructor(ws) {
    this.ws = ws;
    this.sessionId = crypto.randomUUID();
    this.decoder = null;
    this.deviceSampleRate = 16000;
    this.deviceChannels = 1;
    this.listening = false;
    this.audioFrames = [];
    this.mcpNextId = 1;
    this.mcpTools = [];
    this.pendingMcp = new Map();

    ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    ws.on('close', () => this.onClose());
    ws.on('error', () => {});
  }

  send(obj) {
    this.ws.send(JSON.stringify({ session_id: this.sessionId, ...obj }));
  }

  onMessage(data, isBinary) {
    if (isBinary) {
      if (this.listening) this.audioFrames.push(data);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch (_) {
      return;
    }
    switch (msg.type) {
      case 'hello':
        this.onHello(msg);
        break;
      case 'listen':
        this.onListen(msg);
        break;
      case 'abort':
        this.onAbort();
        break;
      case 'mcp':
        this.onMcpMessage(msg);
        break;
      default:
        break; // stt/llm/tts/system/alert are server->device only in this design
    }
  }

  onHello(msg) {
    const params = msg.audio_params || {};
    this.deviceSampleRate = params.sample_rate || 16000;
    this.deviceChannels = params.channels || 1;
    if (this.decoder) this.decoder.dispose();
    this.decoder = opus.createDecoder(this.deviceSampleRate, this.deviceChannels);

    this.send({
      type: 'hello',
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sample_rate: this.deviceSampleRate,
        channels: this.deviceChannels,
        frame_duration: 60,
      },
    });

    if (msg.features && msg.features.mcp) {
      // Best-effort: a failed tool discovery just means no tool-calling
      // this session, not a fatal error for the whole connection.
      this.initMcp().catch(err => console.error('[robot] MCP init failed:', err.message));
    }
  }

  async initMcp() {
    await this.mcpRequest('initialize', { capabilities: {} });
    let cursor = '';
    for (;;) {
      const result = await this.mcpRequest('tools/list', { cursor, withUserTools: false });
      this.mcpTools = this.mcpTools.concat(result.tools || []);
      cursor = result.nextCursor || '';
      if (!cursor) break;
    }
  }

  mcpRequest(method, params) {
    const id = this.mcpNextId++;
    return new Promise((resolve, reject) => {
      this.pendingMcp.set(id, { resolve, reject });
      this.send({ type: 'mcp', payload: { jsonrpc: '2.0', method, params, id } });
      setTimeout(() => {
        if (this.pendingMcp.has(id)) {
          this.pendingMcp.delete(id);
          reject(new Error(`MCP request "${method}" timed out`));
        }
      }, MCP_TIMEOUT_MS);
    });
  }

  onMcpMessage(msg) {
    const payload = msg.payload || {};
    if (payload.id != null && this.pendingMcp.has(payload.id)) {
      const { resolve, reject } = this.pendingMcp.get(payload.id);
      this.pendingMcp.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message || 'MCP error'));
      else resolve(payload.result);
    }
    // Device-initiated notifications (no id) are not acted on in v1.
  }

  onListen(msg) {
    if (msg.state === 'start' || msg.state === 'detect') {
      this.listening = true;
      this.audioFrames = [];
    } else if (msg.state === 'stop') {
      this.listening = false;
      this.processUtterance().catch(err => {
        console.error('[robot] utterance processing failed:', err.message);
      });
    }
  }

  onAbort() {
    this.listening = false;
    this.audioFrames = [];
  }

  onClose() {
    if (this.decoder) this.decoder.dispose();
    this.pendingMcp.forEach(({ reject }) => reject(new Error('session closed')));
    this.pendingMcp.clear();
  }

  async processUtterance() {
    if (!this.audioFrames.length) return;

    const pcm = Buffer.concat(this.audioFrames.map(frame => this.decoder.decodeFrame(frame)));
    const wav = opus.pcmToWav(pcm, this.deviceSampleRate, this.deviceChannels);

    const text = await this.transcribe(wav);
    if (!text) return;
    this.send({ type: 'stt', text });

    const reply = await this.chat(text);
    if (reply.toolCall) {
      await this.callDeviceTool(reply.toolCall);
      // ackText comes from the model's own message.content alongside the tool
      // call (see chat()'s system prompt), already in the user's language.
      // The Vietnamese fallback only fires if the model omitted content.
      await this.speak(reply.ackText || 'Đã thực hiện.');
    } else if (reply.text) {
      await this.speak(reply.text);
    }
  }

  async transcribe(wav) {
    if (!ROBOT_LLM_API_KEY) throw new Error('YANA_ROBOT_LLM_API_KEY not configured');
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', ASR_MODEL);
    const res = await fetch(ASR_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ROBOT_LLM_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`ASR HTTP ${res.status}`);
    const data = await res.json();
    return (data.text || '').trim();
  }

  async chat(userText) {
    const providerEntry = PROVIDERS[ROBOT_LLM_PROVIDER];
    if (!providerEntry) throw new Error(`Unknown provider "${ROBOT_LLM_PROVIDER}"`);

    // NOTE: PROVIDERS[...].body() (used by /api/chat) has no `tools`
    // parameter — the browser chat UI doesn't need function-calling.
    // Building the request body directly here for the robot path instead
    // of forcing that shape onto the shared helper every other caller uses.
    const tools = this.mcpTools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const reqBody = JSON.stringify({
      model: ROBOT_LLM_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content:
            'Bạn là trợ lý điều khiển robot. Luôn trả lời ngắn gọn bằng ĐÚNG ngôn ngữ mà ' +
            'người dùng vừa nói (ví dụ: họ nói tiếng Hàn thì trả lời tiếng Hàn, tiếng Việt ' +
            'thì trả lời tiếng Việt, tiếng Anh thì trả lời tiếng Anh) -- không mặc định về ' +
            'một ngôn ngữ cố định. Nếu người dùng muốn robot di chuyển hoặc thực hiện hành ' +
            'động, hãy gọi đúng 1 tool phù hợp, và LUÔN kèm theo một câu ngắn xác nhận trong ' +
            'nội dung trả lời (content), bằng chính ngôn ngữ người dùng vừa dùng.',
        },
        { role: 'user', content: userText },
      ],
      tools: tools.length ? tools : undefined,
    });

    const upstream = await connectToProvider(
      providerEntry,
      ROBOT_LLM_API_KEY,
      reqBody,
      providerEntry.path,
    );
    const data = await readJsonStream(upstream);
    const message = data.choices && data.choices[0] && data.choices[0].message;
    if (message && message.tool_calls && message.tool_calls.length) {
      const call = message.tool_calls[0];
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        args = {};
      }
      return { toolCall: { name: call.function.name, arguments: args }, ackText: message.content || '' };
    }
    return { text: (message && message.content) || '' };
  }

  async callDeviceTool(toolCall) {
    await this.mcpRequest('tools/call', { name: toolCall.name, arguments: toolCall.arguments });
  }

  async speak(text) {
    const encoder = opus.createEncoder(TTS_SAMPLE_RATE, TTS_CHANNELS, TTS_FRAME_MS);
    let started = false;

    const startPlayback = async () => {
      this.send({ type: 'tts', state: 'start' });
      this.send({ type: 'tts', state: 'sentence_start', text });
      started = true;
      // The firmware schedules its speaking-state transition on the main task.
      // Give it one frame before the first binary packet arrives.
      await delay(TTS_START_DELAY_MS);
    };
    const sendPcm = async (pcm, final = false) => {
      const frames = final ? encoder.pushPcm(pcm, true) : encoder.pushPcm(pcm);
      for (const frame of frames) {
        if (this.ws.readyState !== 1) throw new Error('robot WebSocket closed during TTS');
        this.ws.send(frame, { binary: true });
        if (TTS_PACKET_INTERVAL_MS) await delay(TTS_PACKET_INTERVAL_MS);
      }
    };

    try {
      if (TTS_PROVIDER === 'vieneu') {
        const stream = await this.openVieneuStream(text);
        await startPlayback();
        for await (const chunk of stream) await sendPcm(chunk);
        await sendPcm(Buffer.alloc(0), true);
      } else if (TTS_PROVIDER === 'openai') {
        const wav = await this.synthesizeOpenAi(text);
        const pcm = extractPcm16Wav(wav, TTS_SAMPLE_RATE, TTS_CHANNELS);
        await startPlayback();
        await sendPcm(pcm, true);
      } else {
        throw new Error(`Unknown TTS provider "${TTS_PROVIDER}"`);
      }
    } finally {
      encoder.dispose();
      if (started && this.ws.readyState === 1) this.send({ type: 'tts', state: 'stop' });
    }
  }

  // Cloud fallback for languages VieNeu-TTS doesn't cover (e.g. Korean).
  // Requests WAV explicitly and validates its chunks before Opus encoding.
  async synthesizeOpenAi(text) {
    if (!TTS_API_KEY) throw new Error('YANA_ROBOT_TTS_API_KEY (or YANA_ROBOT_LLM_API_KEY) not configured');
    const res = await fetch(TTS_OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TTS_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: TTS_OPENAI_MODEL,
        voice: TTS_OPENAI_VOICE,
        input: text,
        response_format: 'wav',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  openVieneuStream(text) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ text });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: TTS_SIDECAR_PORT,
          path: '/tts/stream',
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
          timeout: 30000,
        },
        res => {
          if (res.statusCode !== 200) {
            let raw = '';
            res.on('data', chunk => {
              if (raw.length < 1000) raw += chunk.toString('utf8');
            });
            res.on('end', () => reject(new Error(`TTS sidecar HTTP ${res.statusCode}: ${raw.slice(0, 300)}`)));
            return;
          }
          const sampleRate = Number(res.headers['x-audio-sample-rate']);
          const channels = Number(res.headers['x-audio-channels']);
          const format = res.headers['x-audio-sample-format'];
          if (sampleRate !== TTS_SAMPLE_RATE || channels !== TTS_CHANNELS || format !== 's16le') {
            res.destroy();
            reject(
              new Error(
                `Unsupported TTS stream format: ${sampleRate}Hz, ${channels} channel(s), ${format}`,
              ),
            );
            return;
          }
          resolve(res);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TTS synthesis timed out'));
      });
      req.write(body);
      req.end();
    });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractPcm16Wav(wav, expectedSampleRate, expectedChannels) {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('TTS provider returned an invalid WAV file');
  }

  let format = null;
  let pcm = null;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > wav.length) throw new Error('TTS provider returned a truncated WAV file');
    if (id === 'fmt ' && size >= 16) {
      format = {
        encoding: wav.readUInt16LE(start),
        channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4),
        bitsPerSample: wav.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      pcm = wav.subarray(start, end);
    }
    offset = end + (size % 2);
  }

  if (!format || !pcm) throw new Error('TTS WAV is missing fmt or data');
  if (
    format.encoding !== 1 ||
    format.bitsPerSample !== 16 ||
    format.sampleRate !== expectedSampleRate ||
    format.channels !== expectedChannels
  ) {
    throw new Error(
      `Unsupported TTS WAV format: PCM=${format.encoding}, ${format.sampleRate}Hz, ` +
        `${format.channels} channel(s), ${format.bitsPerSample}-bit`,
    );
  }
  return pcm;
}

function readJsonStream(stream) {
  return new Promise((resolve, reject) => {
    let raw = '';
    stream.on('data', c => {
      raw += c;
    });
    stream.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    stream.on('error', reject);
  });
}

module.exports = { attach };
