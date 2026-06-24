---
name: repl-code-execution
description: REPL-driven dynamic code execution patterns for compiled languages. Incremental eval, state persistence between evaluations, error recovery, and sandboxed expression execution. Sources: evcxr/evcxr (Apache-2.0).
origin: yana-ai — synthesized from evcxr/evcxr (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /repl-code-execution

## When to Use

- Build interactive REPL sessions for testing snippets without full compilation cycle
- Incremental evaluation: execute lines and preserve variable state across calls
- Agent-driven code probing: try expressions, inspect results, backtrack on error
- Jupyter-style cell execution for compiled-language notebooks

## Do NOT use for

- Production code execution (use subprocess with strict sandboxing [[runtime-sandbox-runc]])
- JavaScript eval (use vm.Script with [[runtime-metrics-meters]] for memory limits)

---

## Node.js REPL with persistent context

```javascript
import repl from 'repl'
import vm   from 'vm'

// Start a REPL server with shared context
const replServer = repl.start({
  prompt:  '> ',
  useColors: true,
  terminal: false,           // disable TTY features for programmatic use
  eval: customEval,
})

// Inject shared state into REPL context
replServer.context.db     = dbConnection
replServer.context.agents = agentRegistry

function customEval(cmd, context, filename, callback) {
  try {
    const result = vm.runInContext(cmd, context, {
      filename,
      timeout: 3000,           // 3s hard limit per expression
      breakOnSigint: true,
    })
    callback(null, result)
  } catch (err) {
    // Recover from incomplete input (multi-line expressions)
    if (isIncomplete(err)) {
      callback(new repl.Recoverable(err))
    } else {
      callback(null, `[error] ${err.message}`)
    }
  }
}

function isIncomplete(err: Error): boolean {
  return err.message.includes('Unexpected end of input') ||
         err.message.includes('Unexpected token')
}
```

---

## Sandboxed expression evaluation (one-shot)

```javascript
import vm from 'vm'

function evalExpression(code: string, context: Record<string, unknown> = {}): unknown {
  const sandbox = vm.createContext({
    console: { log: (...a) => results.push(a) },
    ...context,
  })
  const results: unknown[][] = []

  const script = new vm.Script(code, { filename: 'repl-eval' })
  const value  = script.runInContext(sandbox, { timeout: 2000 })

  return { value, logs: results }
}

// Usage:
const { value, logs } = evalExpression('1 + 2 * Math.PI', { Math })
// value = 7.283...
```

---

## Incremental state REPL (evcxr-style session)

```typescript
// Stateful session: each submission builds on previous bindings
class ReplSession {
  private ctx = vm.createContext({ require, console, process })
  private history: string[] = []

  eval(code: string): { result: unknown; error?: string } {
    this.history.push(code)
    try {
      const script = new vm.Script(code)
      const result = script.runInContext(this.ctx, { timeout: 5000 })
      return { result }
    } catch (err: any) {
      return { result: undefined, error: err.message }
    }
  }

  reset() {
    this.ctx = vm.createContext({ require, console, process })
    this.history = []
  }
}

const session = new ReplSession()
session.eval('const x = 42')
session.eval('const y = x * 2')      // x is available from previous eval
const { result } = session.eval('y') // → 84
```

---

## Anti-Fake-Pass Checklist

```
❌ vm.runInContext without timeout → infinite loop hangs the process
❌ vm.createContext with full global → sandbox escape via process.exit or require
❌ No error recovery → multi-line input discarded on partial parse
❌ Shared context between untrusted sessions → state pollution across users
❌ eval() instead of vm.Script → no timeout, no sandbox boundary
❌ REPL context mutation without clone → downstream sessions see dirty state
```
