---
name: agent-verification-gate
description: Deterministic verification gate for agent task close-out. Reads scope contract, rule report, feedback log, and diff — emits a single verification_report.json verdict. Block-severity failures cannot be overridden by the agent. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /agent-verification-gate

## When to Use

- Agent is about to mark a task as "done" — gate must confirm before close-out
- CI pipeline needs a machine-readable verdict on whether an agentic change is complete
- Preventing self-certification: agent cannot judge its own work as complete
- Implementing YAMTAM Truth Gate evidence requirement in a structured pipeline

## Do NOT use for

- Qualitative code review (use [[react-agent-loop]] reviewer agent or human review)
- LLM-based quality judgements (this gate is deterministic — no LLM judges)
- Mid-task checkpoints (this is a close-out gate, not a step validator)

---

## What the gate checks

```
Check                                  Source artifact          Severity
─────────────────────────────────────  ───────────────────────  ────────
All acceptance commands ran            feedback_record.jsonl    block
All acceptance commands exited zero    feedback_record.jsonl    block
Scope check: no forbidden writes       scope_report.json        block
Scope check: no off-scope writes       scope_report.json        block or warn
All block-severity rules pass          rule_report.json         block
No null exit codes in feedback         feedback_record.jsonl    block
Touched files match scope.allowed_files both                   warn
```

---

## Data structures

```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass
class FeedbackRecord:
    command: str
    exit_code: int | None
    stdout: str
    stderr: str

@dataclass
class ScopeReport:
    allowed_files: list[str]
    forbidden_writes: list[str]    # files that must not be written
    off_scope_writes: list[str]    # files written outside allowed_files

@dataclass
class RuleReport:
    block_failures: list[str]       # rule IDs that fired at block severity
    warn_failures: list[str]

@dataclass
class Finding:
    check: str
    severity: Literal["block", "warn"]
    detail: str

@dataclass
class VerificationReport:
    task_id: str
    passed: bool
    findings: list[Finding] = field(default_factory=list)
    override_reason: str | None = None
    overridden_by: str | None = None
```

---

## Verification function (deterministic, no LLM)

```python
def verify(
    task_id: str,
    feedback: list[FeedbackRecord],
    scope: ScopeReport,
    rules: RuleReport,
) -> VerificationReport:
    findings: list[Finding] = []

    # 1. Acceptance commands ran
    if not feedback:
        findings.append(Finding("acceptance_ran", "block", "No feedback records — no commands executed"))

    for rec in feedback:
        # 2. Null exit code
        if rec.exit_code is None:
            findings.append(Finding("null_exit_code", "block", f"Command '{rec.command}' has null exit code"))

        # 3. Non-zero exit
        elif rec.exit_code != 0:
            findings.append(Finding("nonzero_exit", "block",
                f"Command '{rec.command}' exited {rec.exit_code}: {rec.stderr[:200]}"))

    # 4. Forbidden writes
    for path in scope.forbidden_writes:
        findings.append(Finding("forbidden_write", "block", f"Wrote to forbidden path: {path}"))

    # 5. Off-scope writes
    for path in scope.off_scope_writes:
        findings.append(Finding("off_scope_write", "block", f"Wrote outside allowed scope: {path}"))

    # 6. Block-severity rule failures
    for rule_id in rules.block_failures:
        findings.append(Finding("rule_block", "block", f"Rule '{rule_id}' failed at block severity"))

    # 7. Warn-only rule failures
    for rule_id in rules.warn_failures:
        findings.append(Finding("rule_warn", "warn", f"Rule '{rule_id}' failed at warn severity"))

    blocks = [f for f in findings if f.severity == "block"]
    return VerificationReport(task_id=task_id, passed=len(blocks) == 0, findings=findings)
```

---

## Human override (block-severity only)

```python
import json, hashlib, datetime

def human_override(
    report: VerificationReport,
    override_reason: str,
    overridden_by: str,
) -> VerificationReport:
    """
    Block findings can ONLY be overridden by a human with a recorded reason.
    The agent cannot call this function on its own behalf.
    """
    report.passed = True
    report.override_reason = override_reason
    report.overridden_by = overridden_by
    return report

def write_report(report: VerificationReport, output_dir: str = "outputs/verification") -> str:
    import os
    os.makedirs(output_dir, exist_ok=True)
    path = f"{output_dir}/{report.task_id}.json"
    with open(path, "w") as f:
        json.dump({
            "task_id": report.task_id,
            "passed": report.passed,
            "findings": [{"check": f.check, "severity": f.severity, "detail": f.detail}
                         for f in report.findings],
            "override_reason": report.override_reason,
            "overridden_by": report.overridden_by,
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }, f, indent=2)
    return path
```

---

## CI integration

```yaml
# .github/workflows/agent-verify.yml
- name: Run verification gate
  run: python scripts/verify_agent.py --task-id $TASK_ID --output-dir outputs/verification

- name: Assert passed
  run: |
    PASSED=$(jq .passed outputs/verification/$TASK_ID.json)
    if [ "$PASSED" != "true" ]; then
      echo "Verification gate FAILED:"
      jq .findings outputs/verification/$TASK_ID.json
      exit 1
    fi
```

---

## Anti-Fake-Pass Checklist

```
❌ LLM judge instead of deterministic gate → agent bribes its own judge
❌ Gate emits multiple reports for same task → forks the source of truth; one path only
❌ Agent can call human_override itself → defeats the entire pattern
❌ No CI integration → gate runs in dev but not in merge pipeline
❌ "warn" findings silently ignored → accumulate; add warning summary to PR comment
❌ Gate skipped when "tests pass" → tests verify code correctness, not task completeness
```
