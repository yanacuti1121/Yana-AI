---
name: agentic-failure-modes
description: MASFT taxonomy of multi-agent failure modes (Berkeley 2025) — 14 modes in 3 categories. Five industry-recurring modes: hallucinated actions, scope creep, cascading errors, context loss, tool misuse. Detection, monitoring, and mitigation patterns. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /agentic-failure-modes

## When to Use

- Post-mortem: agent produced wrong output and you need to classify the failure
- Pre-deployment: instrument a new agent to detect common failure patterns before they hit users
- Monitoring: wire failure-mode detectors into production traces
- Architecture review: ensure mitigations exist for each of the 5 recurring failure types

## Do NOT use for

- LLM base model evaluation (failures here are system/orchestration level, not model-level)
- Prompt engineering improvements (separate from failure mode detection)

---

## MASFT: the 14 failure modes (Berkeley, arXiv:2503.13657)

```
Category 1: Communication failures
  1. Ambiguous instruction transmission
  2. Information loss across agents (context not forwarded)
  3. Conflicting instructions from multiple orchestrators
  4. Trust boundary collapse (tool output treated as trusted instruction)
  5. Protocol mismatch (agents expect different message formats)

Category 2: Reasoning failures
  6. Hallucinated actions (tool call that doesn't exist / wrong arguments)
  7. Long-range contextual misuse (forgetting early-turn constraint)
  8. Sub-intention errors (omission, redundancy, disorder of plan steps)
  9. Instruction-following deviation (ignores system prompt)
  10. Success hallucination (declares done after 400 error)

Category 3: Coordination failures
  11. Scope creep (expands task beyond user's ask)
  12. Cascading errors (one wrong call triggers downstream multi-system incident)
  13. Mission drift (agent's objective shifts over long execution)
  14. Monoculture collapse (all agents in a debate reach same wrong answer)
```

---

## The 5 industry-recurring modes and mitigations

```python
from dataclasses import dataclass
from typing import Literal

FailureMode = Literal[
    "hallucinated_action",
    "scope_creep",
    "cascading_error",
    "context_loss",
    "tool_misuse",
]

@dataclass
class FailureSignal:
    mode: FailureMode
    evidence: str
    severity: Literal["critical", "warning", "info"]

def detect_failure_signals(trace: list[dict]) -> list[FailureSignal]:
    """Scan an agent trace for known failure signatures."""
    signals = []
    action_history: list[str] = []

    for step in trace:
        role = step.get("role", "")
        content = step.get("content", "")

        # 1. Hallucinated action: tool name not in known registry
        if role == "assistant" and "Action:" in content:
            import re
            m = re.search(r'Action:\s*(\w+)', content)
            tool = m.group(1) if m else None
            if tool and tool not in step.get("known_tools", []):
                signals.append(FailureSignal("hallucinated_action", f"Unknown tool: {tool}", "critical"))

        # 2. Success hallucination on tool error
        if role == "tool" and ("400" in content or "error" in content.lower()):
            next_step = trace[trace.index(step) + 1] if trace.index(step) + 1 < len(trace) else {}
            next_content = next_step.get("content", "")
            if any(phrase in next_content.lower() for phrase in ["task complete", "all done", "success"]):
                signals.append(FailureSignal("hallucinated_action",
                    "Success claimed after tool returned error", "critical"))

        # 3. Scope creep: agent wrote to unexpected paths
        if role == "tool" and "wrote" in content.lower():
            import re
            paths = re.findall(r'wrote\s+([/\w\.]+)', content, re.IGNORECASE)
            for path in paths:
                if any(x in path for x in [".env", "secrets", "/etc", "~/.ssh"]):
                    signals.append(FailureSignal("scope_creep",
                        f"Wrote to sensitive path: {path}", "critical"))

        # 4. Context loss: agent repeats a step it already completed
        if role == "assistant" and "Action:" in content:
            import re
            action_sig = re.search(r'Action:\s*\w+\([^)]*\)', content)
            if action_sig:
                sig = action_sig.group(0)
                if sig in action_history:
                    signals.append(FailureSignal("context_loss",
                        f"Repeated action: {sig}", "warning"))
                action_history.append(sig)

    return signals
```

---

## Cascading error: the killer failure mode

```
Anatomy of a cascade:
  Step 1: Agent hallucinates a product SKU "PROD-9999"
  Step 2: Inventory API returns 404 — agent ignores the error
  Step 3: Order placed with invalid SKU
  Step 4: Payment processed (charge real money)
  Step 5: Fulfillment system crashes on bad SKU
  Step 6: Support ticket auto-created
  → Multi-system incident from one hallucinated string

Root problem: agents cannot distinguish "I failed" from "task is impossible"
→ They hallucinate success on errors to close the loop.

Mitigation: require re-probing after every destructive or external call.
```

```python
def verify_state_after_action(tool_name: str, args: dict, result: str, re_probe: callable) -> bool:
    """Re-probe state after any write/external action. Don't trust the return value."""
    if tool_name in ("create_order", "send_email", "deploy", "write_file"):
        actual_state = re_probe(**args)
        if "error" in actual_state.lower() or "not found" in actual_state.lower():
            raise RuntimeError(f"State re-probe failed after {tool_name}: {actual_state}")
    return True
```

---

## Monitoring: wire into OTel traces

```python
# Emit failure-mode signals as OTel span events

from opentelemetry import trace

def emit_failure_events(span, signals: list[FailureSignal]) -> None:
    for s in signals:
        span.add_event(
            name=f"agent.failure_mode.{s.mode}",
            attributes={
                "failure.mode":     s.mode,
                "failure.severity": s.severity,
                "failure.evidence": s.evidence[:500],
            }
        )
    critical = [s for s in signals if s.severity == "critical"]
    if critical:
        span.set_status(trace.StatusCode.ERROR, f"{len(critical)} critical failure(s)")
```

---

## Anti-Fake-Pass Checklist

```
❌ No re-probe after destructive actions → cascades go undetected until downstream incident
❌ Tool errors not surfaced as observations → agent hallucinates success; error is silently swallowed
❌ No failure-mode monitoring → post-mortems rely on manual trace inspection
❌ Trust boundary collapse ignored → tool output appended raw → prompt injection
❌ "Task complete" accepted at face value → always check actual state, not agent's self-report
❌ Same model family for all agents in a debate → monoculture collapse; errors correlate
```
