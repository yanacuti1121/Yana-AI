---
name: pyre-type-analysis
description: Facebook Pyre static type analysis patterns for Python. Incremental type checking, taint tracking for data-flow security analysis, pysa rules, and integrating Pyre into CI pipelines. Sources: facebook/pyre-check (MIT).
origin: yana-ai — synthesized from facebook/pyre-check (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /pyre-type-analysis

## When to Use

- Large Python codebases where mypy is too slow or lacks taint analysis
- Security audits: trace untrusted input (HTTP params) to sinks (SQL, shell, eval)
- Incremental type checking in CI without full re-analysis on every commit
- Data flow analysis: detect secrets leaking into log statements

## Do NOT use for

- JavaScript/TypeScript (use [[eslint-rule-engine]] or [[ts-morph-refactor]])
- Simple type hints (mypy is sufficient for small projects)

---

## .pyre_configuration

```json
{
  "site_package_search_strategy": "all",
  "source_directories": ["src"],
  "exclude": ["**/tests/**", "**/migrations/**"],
  "strict": true,
  "workers": 4,
  "typeshed": null
}
```

---

## Run incremental check

```bash
# Initial start (builds type index)
pyre start

# Incremental check (milliseconds on already-indexed codebase)
pyre check

# Watch mode (re-checks on file save)
pyre incremental

# Stop background server
pyre stop
```

---

## Pysa taint analysis — source/sink model

```python
# stubs/taint/sources.pysa
# Mark Flask request parameters as tainted input sources
def flask.Request.args.__getitem__(self, key: str) -> TaintedString: ...
def flask.Request.form.__getitem__(self, key: str) -> TaintedString: ...
def os.environ.__getitem__(self, key: str) -> TaintedString: ...
```

```python
# stubs/taint/sinks.pysa
# Mark dangerous sinks
def subprocess.run(args: TaintSink[RemoteCodeExecution], ...): ...
def os.system(command: TaintSink[RemoteCodeExecution]): ...
def logging.Logger.info(msg: TaintSink[Logging], *args): ...
```

```python
# stubs/taint/taint.config
{
  "sources": [{ "name": "TaintedString" }],
  "sinks":   [
    { "name": "RemoteCodeExecution" },
    { "name": "Logging" }
  ],
  "rules": [
    {
      "name":        "User-controlled data flows to shell command",
      "code":        5001,
      "sources":     ["TaintedString"],
      "sinks":       ["RemoteCodeExecution"],
      "message_format": "Untrusted input from {$sources} reaches {$sinks}"
    }
  ]
}
```

---

## Run pysa security analysis

```bash
# Run taint analysis (outputs JSON findings)
pyre analyze \
  --taint-models-path stubs/taint \
  --output-format sarif \
  > pyre-findings.sarif

# Filter high-severity findings
jq '.runs[].results[] | select(.level == "error")' pyre-findings.sarif
```

---

## Python type annotation patterns Pyre enforces

```python
from typing import Optional, Union

# Strict: no implicit Optional — must be explicit
def process(user_id: Optional[str]) -> dict[str, int]:
    if user_id is None:
        return {}
    return {"id": int(user_id)}

# Union narrowing — Pyre checks exhaustiveness
def handle(value: str | int) -> str:
    if isinstance(value, str):
        return value.upper()
    return str(value)   # Pyre confirms both branches handled
```

---

## Anti-Fake-Pass Checklist

```
❌ pyre start not run before pyre check → no background server, check fails
❌ Missing .pyre_configuration → Pyre analyzes wrong directories
❌ strict: false in config → Optional not enforced, many type errors silently ignored
❌ Pysa without .pysa stubs → taint analysis finds nothing (no source/sink model)
❌ TaintedString applied too broadly → every string becomes a taint source; false positives flood output
❌ SARIF output not parsed → raw JSON misread as all-pass
```
