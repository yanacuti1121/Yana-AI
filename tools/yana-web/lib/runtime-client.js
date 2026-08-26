'use strict';

const { spawn } = require('child_process');

const MAX_PROTOCOL_LINE = 1024 * 1024;

// Providers implemented by src/model/catalog.rs. This set is intentionally
// checked against the web provider table in _test_runtime_client.js so the
// Desktop gateway cannot silently drift back to a JavaScript-only provider.
const GOVERNED_PROVIDERS = new Set([
  'anthropic', 'groq', 'openai', 'gemini', '9router', 'ollama', 'lmstudio',
  'turbofieldfare', 'deepseek', 'openrouter', 'xai', 'novita', 'nvidia',
  'kimi', 'minimax', 'glm', 'huggingface', 'llamacpp', 'airllm',
]);

function supportsGovernedProvider(provider) {
  return GOVERNED_PROVIDERS.has(provider);
}

function streamGovernedTurn({
  binaryPath,
  rootDir,
  provider,
  model,
  input,
  onEvent,
  signal,
  spawnImpl = spawn,
}) {
  if (!binaryPath) return Promise.reject(new Error('YANA_RT_BIN is not configured'));
  if (!supportsGovernedProvider(provider)) {
    return Promise.reject(new Error(`provider '${provider}' is not available in the governed runtime`));
  }

  return new Promise((resolve, reject) => {
    const args = ['chat', '--headless', '--provider', provider];
    if (model) args.push('--model', model);
    const child = spawnImpl(binaryPath, args, {
      cwd: rootDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdoutBuffer = '';
    let stderr = '';
    let completed = false;
    let finalMessage = '';
    let usage = null;
    let protocolError = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', abort);
      fn(value);
    };
    const abort = () => {
      child.kill('SIGTERM');
      finish(reject, new Error('governed turn cancelled'));
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      else signal.addEventListener('abort', abort, { once: true });
    }

    const acceptLine = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); }
      catch (_) { throw new Error('yana-rt emitted invalid NDJSON'); }
      if (!event || typeof event.type !== 'string') {
        throw new Error('yana-rt emitted an event without a type');
      }
      if (event.type === 'completed') {
        completed = true;
        finalMessage = typeof event.message === 'string' ? event.message : '';
      } else if (event.type === 'metrics') {
        usage = {
          input_tokens: Number(event.input_tokens) || 0,
          output_tokens: Number(event.output_tokens) || 0,
        };
      }
      onEvent(event);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (protocolError) return;
      stdoutBuffer += chunk;
      if (stdoutBuffer.length > MAX_PROTOCOL_LINE && !stdoutBuffer.includes('\n')) {
        protocolError = new Error('yana-rt NDJSON line exceeds 1 MiB');
        child.kill('SIGTERM');
        return;
      }
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      try { for (const line of lines) acceptLine(line); }
      catch (error) {
        protocolError = error;
        child.kill('SIGTERM');
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (stderr.length < 16 * 1024) stderr += chunk;
    });
    child.on('error', error => finish(reject, error));
    child.on('close', code => {
      if (settled) return;
      if (!protocolError && stdoutBuffer.trim()) {
        try { acceptLine(stdoutBuffer); }
        catch (error) { protocolError = error; }
      }
      if (protocolError) return finish(reject, protocolError);
      if (code !== 0 || !completed) {
        const detail = stderr.trim();
        return finish(reject, new Error(detail || `yana-rt exited ${code} before completing the turn`));
      }
      finish(resolve, { message: finalMessage, usage });
    });

    child.stdin.on('error', error => finish(reject, error));
    child.stdin.end(JSON.stringify(input));
  });
}

module.exports = { GOVERNED_PROVIDERS, supportsGovernedProvider, streamGovernedTurn };
