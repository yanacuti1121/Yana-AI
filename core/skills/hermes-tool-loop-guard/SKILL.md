---
name: hermes-tool-loop-guard
description: Detect and stop within-turn tool-call failure loops and no-progress idempotent loops. Three detectors — exact failure (same tool+args), same-tool failure, no-progress (idempotent returns same result N times). Warn-first, hard-stop opt-in. Source: NousResearch/hermes-agent (MIT).
origin: NousResearch/hermes-agent (MIT) — agent/tool_guardrails.py
license: MIT
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

## Implementation (real, runnable — added 2026-06-19)

The original `agent/tool_guardrails.py` was already pure/side-effect-free
("the controller is intentionally side-effect free" — its own docstring),
so this is a near-verbatim port; only the two external imports
(`utils.safe_json_loads`, `agent.tool_result_classification`) were inlined.

- Module: `core/lib/hermes_adapted/tool_guardrails.py`
- Tests:  `tests/test_hermes_tool_guardrails.py` (6 passing)

Note: `core/skills/hermes-tool-guardrails/SKILL.md` (a separate skill) is
NOT this — that skill describes a command-allowlist/approval-gate pattern
that doesn't match what's actually in hermes-agent's real
`tool_guardrails.py`. Fixed 2026-06-20: false `source`/`license` attribution
removed from that file (the pattern doesn't exist anywhere in the vendored
upstream source — verified by grep), content kept as Yana AI-native.

# /hermes-tool-loop-guard

## When to Use

- Agent loops calling the same tool with identical args and failing repeatedly
- Read-only tools (search, file read) returning identical results — agent stuck in no-progress loop
- Building a mission dispatcher or tool-execution layer that needs loop protection
- Autonomous agents that can run more than 10 tool calls per turn

## Do NOT use for

- Command allowlist / approval gate — see [[hermes-tool-guardrails]] for that
- Human-in-the-loop flows where the user sees each call and interrupts manually
- See also: [[hermes-conversation-loop]] for iteration-budget and stale-stream detection

---

## Three Detector Types

```
1. Exact failure     — same tool + same args hash fails N times → warn / block
2. Same-tool failure — same tool name (any args) fails N times  → warn / halt
3. No-progress       — idempotent tool returns same result N times → warn / block
```

---

## Idempotent vs Mutating classification

```python
IDEMPOTENT_TOOLS = {
    "read_file", "list_dir", "web_search", "web_fetch",
    "browser_snapshot", "grep", "glob", "get_file_info",
    "search_files", "view_image", "memory_recall", "get_env",
}
# Only IDEMPOTENT tools trigger no-progress detection
# Mutating tools (write_file, terminal, etc.) are excluded
```

---

## Implementation

```python
import hashlib, json
from dataclasses import dataclass
from typing import Literal

Action = Literal["allow", "warn", "block", "halt"]

@dataclass
class LoopGuardConfig:
    warnings_enabled:   bool = True
    hard_stop_enabled:  bool = False   # opt-in — default is gentle warn-only
    exact_warn_after:   int  = 2
    exact_block_after:  int  = 5
    tool_warn_after:    int  = 3
    tool_halt_after:    int  = 8
    noprog_warn_after:  int  = 2
    noprog_block_after: int  = 5

@dataclass
class LoopGuardDecision:
    action:  Action
    message: str = ""

def _hash_args(args: dict) -> str:
    return hashlib.sha256(
        json.dumps(args, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]

class ToolLoopGuard:
    def __init__(self, cfg: LoopGuardConfig | None = None):
        self._cfg         = cfg or LoopGuardConfig()
        self._exact_fails: dict[str, int] = {}          # "tool:argshash" → count
        self._tool_fails:  dict[str, int] = {}          # "tool" → count
        self._noprog:      dict[str, tuple[int, str]] = {}  # "tool:argshash" → (count, last_hash)

    def before_call(self, tool: str, args: dict) -> LoopGuardDecision:
        key = f"{tool}:{_hash_args(args)}"
        if (self._exact_fails.get(key, 0) >= self._cfg.exact_block_after
                and self._cfg.hard_stop_enabled):
            n = self._exact_fails[key]
            return LoopGuardDecision("block",
                f"{tool} failed {n}x with identical args — hard stop")
        if (self._tool_fails.get(tool, 0) >= self._cfg.tool_halt_after
                and self._cfg.hard_stop_enabled):
            n = self._tool_fails[tool]
            return LoopGuardDecision("halt", f"{tool} failed {n}x this turn — halting")
        return LoopGuardDecision("allow")

    def after_call(self, tool: str, args: dict,
                   result: str, success: bool) -> LoopGuardDecision:
        key = f"{tool}:{_hash_args(args)}"

        if not success:
            self._exact_fails[key] = self._exact_fails.get(key, 0) + 1
            self._tool_fails[tool] = self._tool_fails.get(tool, 0) + 1
            n = self._exact_fails[key]
            if n >= self._cfg.exact_warn_after and self._cfg.warnings_enabled:
                return LoopGuardDecision("warn",
                    f"{tool} failed {n}x with same args — try different approach")
            return LoopGuardDecision("allow")

        if tool in IDEMPOTENT_TOOLS:
            rh = hashlib.sha256(result.encode()).hexdigest()[:16]
            prev_n, prev_h = self._noprog.get(key, (0, ""))
            if rh == prev_h:
                new_n = prev_n + 1
                self._noprog[key] = (new_n, rh)
                if new_n >= self._cfg.noprog_block_after and self._cfg.hard_stop_enabled:
                    return LoopGuardDecision("block",
                        f"{tool} returned identical result {new_n}x — no progress")
                if new_n >= self._cfg.noprog_warn_after and self._cfg.warnings_enabled:
                    return LoopGuardDecision("warn",
                        f"{tool} returned same result {new_n}x — change query")
            else:
                self._noprog[key] = (0, rh)

        return LoopGuardDecision("allow")

    def reset(self) -> None:
        """Call once at turn start — not per tool call."""
        self._exact_fails.clear()
        self._tool_fails.clear()
        self._noprog.clear()
```

---

## Wiring into tool dispatch

```python
guard = ToolLoopGuard(LoopGuardConfig(hard_stop_enabled=True))
guard.reset()   # once per turn

async def dispatch_tool(tool: str, args: dict) -> str:
    pre = guard.before_call(tool, args)
    if pre.action in ("block", "halt"):
        return f"[LOOP-GUARD] {pre.message}"
    if pre.action == "warn":
        print(f"[WARN] {pre.message}")

    try:
        result, success = await run_tool(tool, args), True
    except Exception as e:
        result, success = str(e), False

    post = guard.after_call(tool, args, result, success)
    if post.action == "warn":
        print(f"[WARN] {post.message}")
    if post.action in ("block", "halt") and guard._cfg.hard_stop_enabled:
        return f"[LOOP-GUARD] {post.message}"
    return result
```

---

## Anti-Fake-Pass Checklist

```
❌ reset() called per-call instead of per-turn — counts never accumulate
❌ Mutating tools in IDEMPOTENT_TOOLS — write_file returning same result is normal
❌ hard_stop_enabled=True in interactive mode — blocks user without escape
❌ Arg hash on unsorted dict — same args hash differently each call
❌ Result hash on truncated output — large identical results bypass dedup
```
