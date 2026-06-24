---
name: ai-gateway-patterns
description: AI gateways for LLM serving — provider routing, fallback, retries, rate limiting, secrets, observability, guardrails. LiteLLM (OSS, <500 RPS), Portkey (guardrails, Apache 2.0 2026), Kong AI Gateway (228% faster than Portkey at scale), Bifrost (retry/fallback). Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /ai-gateway-patterns

## When to Use

- Multiple LLM providers (OpenAI + Anthropic + self-hosted Llama) behind one API
- Provider fallback: if OpenAI 429s, try Anthropic automatically
- Per-tenant rate limiting without coupling every app to every provider
- Regulated industries needing PII redaction + guardrails in one layer
- Unified observability and cost attribution across providers

## Do NOT use for

- Single-provider, single-model setups with no failover requirements
- Latency-critical paths where the 20–40 ms gateway overhead is unacceptable
- Development prototypes (unnecessary complexity)

---

## Six core gateway features

```
1. Provider routing   — OpenAI, Anthropic, Gemini, self-hosted behind one API
2. Fallback           — on 429 / 5xx / quality failure → retry on alternate provider
3. Retries            — exponential backoff, bounded attempts
4. Rate limits        — per-tenant, per-key, per-model
5. Secret references  — credentials from vault at runtime (never in app code)
6. Observability      — OTel + GenAI attributes + cost attribution
7. Guardrails         — PII redaction, jailbreak detection, topic filters
```

---

## LiteLLM — MIT OSS, Python (<500 RPS)

```python
# litellm.proxy_server or direct SDK usage
import litellm

# Config-driven routing
litellm.set_verbose = False

# Fallback: try Claude first, fall back to GPT-4 on failure
response = litellm.completion(
    model="claude-opus-4-7",
    messages=[{"role": "user", "content": "Hello"}],
    fallbacks=[{"model": "gpt-4o", "api_key": "OPENAI_KEY"}],
    num_retries=3,
    timeout=30,
)

# LiteLLM proxy server config
# litellm_config.yaml:
# model_list:
#   - model_name: claude-opus
#     litellm_params:
#       model: claude-opus-4-7
#       api_key: os.environ/ANTHROPIC_KEY
#   - model_name: gpt-4o
#     litellm_params:
#       model: gpt-4o
#       api_key: os.environ/OPENAI_KEY
# router_settings:
#   fallbacks: [{"claude-opus": ["gpt-4o"]}]
#   num_retries: 3

# Start proxy: litellm --config litellm_config.yaml --port 4000
# Ceiling: ~2,000 RPS (Kong benchmark); cascading failures under sustained load
# Best fit: Python apps, <500 RPS, dev/staging
```

---

## Portkey — guardrails + control plane

```typescript
import Portkey from "portkey-ai";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.ANTHROPIC_VIRTUAL_KEY,  // credentials in Portkey vault
  config: {
    retry:    { attempts: 3, on_status_codes: [429, 500, 503] },
    cache:    { mode: "semantic" },
    guardrails: [
      { type: "pii_redaction", action: "mask" },
      { type: "jailbreak_detection", action: "block" },
    ],
  },
});

const response = await portkey.chat.completions.create({
  model: "claude-opus-4-7",
  messages: [{ role: "user", content: "Hello" }],
});

// Portkey overhead: 20–40 ms per request
// Apache 2.0 (March 2026) — $49/mo for production tier with retention + SLA
// Best fit: regulated industries, guardrails + audit trail required
```

---

## Kong AI Gateway — scale play (>1,000 RPS)

```bash
# Kong benchmark on 12-CPU equivalent:
# 228% faster than Portkey, 859% faster than LiteLLM
# Pricing: $100/model/month, max 5 on Plus tier

# Enable AI proxy plugin
curl -X POST http://localhost:8001/services \
  -d name=llm-service \
  -d url=https://api.anthropic.com

curl -X POST http://localhost:8001/services/llm-service/plugins \
  -d name=ai-proxy \
  -d "config.provider=anthropic" \
  -d "config.auth.header_name=x-api-key" \
  -d "config.auth.header_value=$(cat $ANTHROPIC_KEY_FILE)" \
  -d "config.model.name=claude-opus-4-7"

# Add rate limiting per consumer
curl -X POST http://localhost:8001/services/llm-service/plugins \
  -d name=rate-limiting \
  -d "config.minute=100" \
  -d "config.policy=local"

# Best fit: already on Kong, >1,000 RPS, willing to license
```

---

## Bifrost (Maxim AI) — retry/fallback recipe

```typescript
// Bifrost: automatic retries with configurable backoff + Anthropic fallback on OpenAI 429
// Canonical recipe:
const bifrostConfig = {
  providers: [
    {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      models: ["gpt-4o"],
    },
    {
      name: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: ["claude-opus-4-7"],
      fallbackFor: ["openai"],    // activate when openai returns 429
    },
  ],
  retry: {
    maxAttempts: 3,
    backoff: "exponential",
    retryOn: [429, 500, 503],
  },
};
```

---

## Choosing a gateway

```
Scenario                                      Gateway
────────────────────────────────────────────  ─────────────────────────────────
Python app, <500 RPS, dev/staging             LiteLLM (free, zero friction)
Regulated: PII redaction + audit trail        Portkey (Apache 2.0, $49/mo prod)
>1,000 RPS + already on Kong                  Kong AI Gateway ($100/model/month)
Simple retry/fallback, commercial product     Bifrost or Cloudflare AI Gateway
Zero ops, serverless                          Cloudflare / Vercel AI Gateway
Data residency requirement → self-host        LiteLLM proxy or Portkey OSS
```

---

## Observability wiring (OTel + GenAI semantic conventions)

```python
# Standard GenAI span attributes (OTel GenAI semantic conventions)
span.set_attribute("gen_ai.system",              "anthropic")
span.set_attribute("gen_ai.request.model",       "claude-opus-4-7")
span.set_attribute("gen_ai.usage.input_tokens",  response.usage.input_tokens)
span.set_attribute("gen_ai.usage.output_tokens", response.usage.output_tokens)
span.set_attribute("gen_ai.response.finish_reasons", ["stop"])

# Cost attribution
cost_usd = (input_tokens * 0.000003) + (output_tokens * 0.000015)
span.set_attribute("gen_ai.cost.usd", cost_usd)
```

---

## Anti-Fake-Pass Checklist

```
❌ LiteLLM at >2,000 RPS → cascading failures; switch to Kong
❌ API keys in app code → always use virtual key / vault reference
❌ No fallback configuration → single provider outage = full app outage
❌ Guardrails only at gateway → bypass possible via direct API calls; also enforce at app layer
❌ No cost attribution → can't attribute $50K cloud bill to specific features/tenants
❌ Semantic caching with no TTL → stale cached responses for time-sensitive queries
```
