---
name: regex-escape-redos-guard
description: Prevent ReDoS (Regex Denial of Service) by escaping user-supplied regex special characters. escape-string-regexp patterns, catastrophic backtracking detection, safe dynamic regex construction, and timeout guards. Sources: sindresorhus/escape-string-regexp.
origin: yamtam-engine — synthesized from sindresorhus/escape-string-regexp (MIT), OWASP ReDoS guidance
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /regex-escape-redos-guard

## When to Use

- Building regex from user input or agent-supplied strings
- Search/replace where the pattern comes from config/user data
- Escaping file names, URLs, or shell strings before regex use
- Detecting and blocking catastrophically backtracking patterns

## Do NOT use for

- Sanitizing HTML/code content (use [[dompurify-xss-prevention]])
- Validating regex syntax (use a dedicated regex linter)

---

## Basic escaping

```javascript
import escapeStringRegexp from 'escape-string-regexp'

function safeSearch(haystack: string, needle: string, flags = 'gi'): RegExpMatchArray | null {
  const escaped = escapeStringRegexp(needle)
  // All regex special chars escaped: . * + ? ^ $ { } [ ] | ( ) \
  return haystack.match(new RegExp(escaped, flags))
}

// Without escaping — DANGEROUS:
// const re = new RegExp(userInput) ← ReDoS if userInput = '(a+)+'
// With escaping — safe:
const re = new RegExp(escapeStringRegexp(userInput))
```

---

## DIY escaping (no dependency)

```javascript
// escape-string-regexp implementation (tiny, copy inline if preferred)
function escapeRegex(str: string): string {
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d')
}
```

---

## ReDoS patterns to reject (denylist)

```javascript
// Patterns with catastrophic backtracking potential
const REDOS_PATTERNS = [
  /\(.*\+\).*\+/,    // (a+)+
  /\(.*\*\).*\*/,    // (a*)*
  /\(.*\|\).*\|/,    // alternation with empty branches
  /\.\*.*\.\*/,      // .*.* — exponential on non-matching input
]

function isReDoSSafe(pattern: string): boolean {
  return !REDOS_PATTERNS.some(r => r.test(pattern))
}

// Reject before compiling
function safeRegex(pattern: string, flags = ''): RegExp {
  if (!isReDoSSafe(pattern)) {
    throw new Error(`[regex] potentially catastrophic pattern: ${pattern}`)
  }
  return new RegExp(pattern, flags)
}
```

---

## Timeout guard (Node.js worker thread)

```javascript
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads'

// Run regex in a worker with a timeout to kill it if it hangs
function regexWithTimeout(
  input:    string,
  pattern:  string,
  timeoutMs = 100
): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { input, pattern }
    })
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error('[regex] timeout — possible ReDoS'))
    }, timeoutMs)

    worker.on('message', (result) => { clearTimeout(timer); resolve(result) })
    worker.on('error',   (err)    => { clearTimeout(timer); reject(err) })
  })
}

if (!isMainThread) {
  const { input, pattern } = workerData
  const match = input.match(new RegExp(pattern, 'g'))
  parentPort!.postMessage(match)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ new RegExp(userInput) without escaping → ReDoS or injection of any pattern
❌ denylist pattern approach alone (imperfect) → pair with escaping or timeout
❌ Timeout guard kills worker but request hangs → must resolve/reject in timeout handler
❌ Flag 'g' + lastIndex not reset → regex object stateful, skips matches on second call
❌ Backslash in input not escaped → \\w in user input becomes \w (wildcard) in regex
```
