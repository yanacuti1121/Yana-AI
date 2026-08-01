'use strict';

// Provider retry + circuit breaker + same-shape failover for the chat
// gateway. See docs/Yana-AI-Danh-gia-Kien-truc-Bao-mat.md section 2.3:
// handleApiChat previously picked one provider and made exactly one
// request — any failure (bad status or transport error) just wrote an
// SSE error frame and ended, with zero retry and zero fallback.
//
// State-machine design (not code — the original is a Claude-Code
// PreToolUse hook with a block/warn/allow exit-code contract that has no
// analog in an HTTP request path) ported from
// core/hooks/per-tool-circuit-breaker.sh: CLOSED -> 5 consecutive
// failures -> OPEN (60s cooldown, backoff x5 per repeat open, capped at
// 1800s) -> HALF_OPEN (one probe allowed) -> success resets to CLOSED,
// failure re-opens with the next backoff step. In-memory Map is
// deliberate here — unlike the original hook's JSONL/grep/awk storage
// (unsafe under concurrent requests), this repo's server.js is one
// long-lived process, not spawned fresh per call.

const MAX_FAILURES = 5;
const COOLDOWN_INITIAL_MS = 60_000;
const COOLDOWN_MAX_MS = 1_800_000;
const COOLDOWN_MULTIPLIER = 5;

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor() {
    this._circuits = new Map();
  }

  _get(provider) {
    if (!this._circuits.has(provider)) {
      this._circuits.set(provider, {
        state: STATE.CLOSED,
        failureCount: 0,
        cooldownUntil: 0,
        backoffMs: COOLDOWN_INITIAL_MS,
      });
    }
    return this._circuits.get(provider);
  }

  // True if a call to this provider should be attempted right now. Has a
  // side effect: transitions OPEN -> HALF_OPEN once the cooldown has
  // elapsed (standard circuit-breaker behavior — the transition itself
  // IS the "let's find out if it recovered" probe gate).
  canAttempt(provider, now = Date.now()) {
    const c = this._get(provider);
    if (c.state === STATE.CLOSED) return true;
    if (c.state === STATE.OPEN) {
      if (now >= c.cooldownUntil) {
        c.state = STATE.HALF_OPEN;
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow the attempt. A HALF_OPEN probe is expected to be
    // immediately followed by recordSuccess/recordFailure by the same
    // caller before another request re-checks this provider — acceptable
    // for provider-outage frequency, not a hot loop.
    return true;
  }

  recordSuccess(provider) {
    const c = this._get(provider);
    c.state = STATE.CLOSED;
    c.failureCount = 0;
    c.backoffMs = COOLDOWN_INITIAL_MS;
    c.cooldownUntil = 0;
  }

  recordFailure(provider, now = Date.now()) {
    const c = this._get(provider);
    if (c.state === STATE.HALF_OPEN) {
      // The recovery probe itself failed — re-open with escalated backoff.
      c.backoffMs = Math.min(c.backoffMs * COOLDOWN_MULTIPLIER, COOLDOWN_MAX_MS);
      c.state = STATE.OPEN;
      c.cooldownUntil = now + c.backoffMs;
      return;
    }
    c.failureCount++;
    if (c.failureCount >= MAX_FAILURES) {
      c.state = STATE.OPEN;
      c.cooldownUntil = now + c.backoffMs;
    }
  }

  getState(provider) {
    return this._get(provider).state;
  }
}

// Providers confirmed (this session's research) to share an identical
// {model, max_tokens, messages, stream} request body and
// choices[0].delta.content SSE response shape — a request built for one
// can be replayed against another with zero transformation. anthropic/
// gemini use different shapes and are never fallback targets. Local
// providers (9router/ollama/lmstudio) are deliberately excluded from
// automatic failover — a user already picks those explicitly; silently
// failing a cloud request over into a local model they may not have
// running isn't a sensible default (tracked separately, not this pass).
const OPENAI_SHAPE_PROVIDERS = ['groq', 'openai', 'openrouter', 'xai', 'deepseek'];

// Pure function: builds the ordered candidate chain — primary first,
// then any same-shape provider for which the client supplied a key in
// fallbackApiKeys (server.js is BYOK; this never persists a key, it only
// reads what's in the current request body). Circuit-breaker gating is
// NOT done here — the caller checks canAttempt() live, immediately
// before each real attempt, so this function's output is deterministic
// and independent of mutable breaker state (easier to test, and correct:
// a candidate's circuit could open/close between when the chain is built
// and when it's actually its turn to be tried).
function buildFallbackChain(primaryProviderKey, primaryApiKey, fallbackApiKeys) {
  const chain = [{ providerKey: primaryProviderKey, apiKey: primaryApiKey }];
  if (!fallbackApiKeys || typeof fallbackApiKeys !== 'object') return chain;
  if (!OPENAI_SHAPE_PROVIDERS.includes(primaryProviderKey)) return chain;
  for (const candidate of OPENAI_SHAPE_PROVIDERS) {
    if (candidate === primaryProviderKey) continue;
    const key = fallbackApiKeys[candidate];
    if (typeof key === 'string' && key) chain.push({ providerKey: candidate, apiKey: key });
  }
  return chain;
}

module.exports = { CircuitBreaker, buildFallbackChain, OPENAI_SHAPE_PROVIDERS, STATE };
