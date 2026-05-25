**Rule:** token-budget-policy
**Status:** REVIEWED
**Gate:** L1 — all agent sessions (token generation, model routing, circuit breaker)
**Source:** berriai/litellm (spend tracking), dqbd/tiktoken (token counting), model-router.sh, hegelai/promptmetheus (token ROI)

---

# Token Budget Policy

## Purpose

Enforce per-session token limits, auto-route to cheaper models for low-complexity tasks,
and break infinite generation loops before they exhaust the operating budget.

---

## Budget limits (per session)

| Tier       | Model                | Max input tokens | Max output tokens | Max cost  |
|------------|----------------------|-----------------|-------------------|-----------|
| fast       | claude-haiku-4-5     | 10,000          | 2,000             | $0.05     |
| power      | claude-sonnet-4-6    | 50,000          | 8,000             | $0.50     |
| emergency  | any                  | 200,000         | 16,000            | $2.00     |

---

## Model routing rules

1. **Route to fast** when:
   - Token estimate (input) < 200 tokens
   - Task keyword is in: format, lint, count, list, sort, rename, trim, grep
   - No multi-step reasoning required

2. **Route to power** when:
   - Token estimate ≥ 800 tokens
   - Task keywords: implement, refactor, analyze, debug, design, compare, evaluate
   - Output requires code generation > 100 lines
   - Explicit `--tier power` flag in tool call

3. **Emergency escalation** only when:
   - Explicitly authorized by human gate (human-gate-policy.md)
   - Session token budget pre-approved for the specific task

---

## Circuit breaker (infinite loop detection)

Trigger circuit breaker when ANY of:

```
Token growth rate: output_tokens[n] > output_tokens[n-1] * 1.5  (3 consecutive turns)
Loop signature:    same prompt substring (> 50 chars) repeated in 2+ consecutive turns
Budget exceeded:   cumulative_session_tokens > tier_max_input_tokens
Time exceeded:     single tool call > 60s with no partial output
```

On circuit breaker trigger:
1. Log event to audit trail (L0 hash-chain)
2. Stop current generation immediately
3. Return `CIRCUIT_BREAKER_TRIGGERED` to caller with token count
4. Require explicit human resume to continue

---

## Token ROI scoring

Before starting a power-tier task, estimate ROI:

```
ROI = expected_value / estimated_cost

expected_value = complexity_score * base_value (1-10 scale)
estimated_cost = (input_tokens + output_tokens) * tier_price_per_1k

Proceed if ROI >= 2.0
Warn user  if ROI is 1.0 – 1.9
Refuse     if ROI < 1.0 (expected output not worth the cost)
```

---

## Enforcement points

- `model-router.sh`: assigns `--tier` flag before each tool call
- `tool-proxy.sh` PHASE 3 (mutate): checks YAMTAM_SESSION_TOKENS env var
- `sandbox-exec.sh`: enforces timeout (60s default) as circuit breaker proxy
- `secure-logger.sh`: records token usage per session for post-session audit

---

## Violations

| Violation                          | Action                          |
|------------------------------------|---------------------------------|
| Session tokens > tier max          | Hard stop, log BUDGET_EXCEEDED  |
| Loop detected (3 signatures)       | Hard stop, log LOOP_DETECTED    |
| Power tier without authorization   | Downgrade to fast, log REROUTED |
| Cost estimate > $2.00 per session  | Require human-gate approval     |

---

## Anti-Fake-Pass (never claim PASS without evidence)

```
❌ Token count estimated without tiktoken/tokenizer — 4-char approximation can be ±30%
❌ Circuit breaker not tested with actual loop prompt before deployment
❌ Budget limits defined here but not enforced in tool-proxy.sh → dead letter rule
❌ ROI scoring without calibrated expected_value baseline → arbitrary numbers
❌ Emergency tier used without human-gate approval → violates [[human-gate-policy]]
```
