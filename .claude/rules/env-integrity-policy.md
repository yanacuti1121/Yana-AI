# YAMTAM ENGINE — Environment Integrity Policy
# Source: aquasecurity/defsec execution context security rules (Apache 2.0)
# github.com/aquasecurity/defsec
# Gate: Action Gate L2 (pre-commit + pre-execution)

**Status:** Active  
**Tier:** TIER 1 — SECURITY  
**Scope:** All code and scripts that set or modify environment variables

---

## Core Rule

Agents MUST NOT generate code or commands that modify critical environment variables
(`$PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `PYTHONPATH`, `NODE_PATH`, etc.)
unless the new value is declared in the environment whitelist at `core/config/env-whitelist.json`.

---

## Critical Variables — Protected

### Tier A — Absolute Block (any modification = Gate L2 block)

```
LD_PRELOAD          — injects arbitrary .so into every process
LD_LIBRARY_PATH     — overrides system library search path
LD_AUDIT            — intercepts all dynamic linker calls
DYLD_INSERT_LIBRARIES  — macOS equivalent of LD_PRELOAD
PYTHONSTARTUP       — auto-executes Python file on interpreter start
PYTHONINSPECT       — enables interactive mode even in scripts
NODE_OPTIONS        — injects Node.js flags (--require, --experimental-*)
```

### Tier B — Require Whitelist Entry

```
PATH                — prepending unknown dirs enables binary hijacking
PYTHONPATH          — prepending dirs enables module shadowing
NODE_PATH           — same as PYTHONPATH for Node
RUBYLIB             — Ruby library path
PERL5LIB            — Perl module path
JAVA_TOOL_OPTIONS   — JVM options injection
CLASSPATH           — Java class path override
```

### Tier C — Log and Allow (with audit trail)

```
HOME                — session-scoped only
TMPDIR              — must remain within /tmp
EDITOR / VISUAL     — safe to set
LANG / LC_*         — locale settings
```

---

## Whitelist Format

`core/config/env-whitelist.json`:

```json
{
  "PATH_prepend_allowed": [
    "/usr/local/bin",
    "/home/codespace/.local/bin"
  ],
  "PYTHONPATH_allowed": [
    "./src",
    "./lib"
  ],
  "NODE_PATH_allowed": [
    "./node_modules"
  ]
}
```

Any `PATH` modification not matching `PATH_prepend_allowed` → Gate L2 block.

---

## Banned Code Patterns

```bash
# ❌ BLOCKED — Tier A variable modification
export LD_PRELOAD=/tmp/malicious.so
LD_PRELOAD=./hook.so ./target
unset -f sudo; export LD_PRELOAD=...

# ❌ BLOCKED — PATH hijacking
export PATH="/tmp:$PATH"
export PATH="$HOME/evil:$(pwd):$PATH"

# ❌ BLOCKED — Python/Node module shadowing
export PYTHONPATH="/tmp/fake-requests:$PYTHONPATH"
export NODE_OPTIONS="--require /tmp/inject.js"
```

```python
# ❌ BLOCKED
import os
os.environ['LD_PRELOAD'] = '/tmp/malicious.so'
os.environ['PATH'] = '/tmp/evil:' + os.environ['PATH']
```

```typescript
// ❌ BLOCKED
process.env.NODE_OPTIONS = '--require /tmp/inject'
process.env.PATH = '/tmp/evil:' + process.env.PATH
```

---

## Detection at pre-commit-gate

`verify-rules.sh` scans staged files for:

```
grep -rE "(LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT|NODE_OPTIONS\s*=)" staged_files
grep -rE 'PATH\s*=\s*["\']?/tmp' staged_files
grep -rE "os\.environ\[.LD_PRELOAD.\]" staged_files
```

Any match → emit BLOCKED + merge block.

---

## Violation Response

```
[yamtam/env-integrity] BLOCKED — critical environment variable modification
  Variable : <name>
  File     : <path>:<line>
  Tier     : A/B
  Gate     : L2
  Fix      : Add to env-whitelist.json with justification, or remove the modification
```
