---
name: fetch-redirect-ssrf-guard
description: SSRF prevention via redirect chain control in HTTP fetch. Block automatic redirect following to internal IPs, validate post-redirect destination, manual redirect handling, and timeout enforcement. Sources: node-fetch/node-fetch, OWASP SSRF Cheat Sheet.
origin: yamtam-engine — synthesized from node-fetch/node-fetch (MIT), OWASP SSRF Prevention Cheat Sheet
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /fetch-redirect-ssrf-guard

## When to Use

- Any HTTP fetch from agent code that follows redirects
- Blocking open-redirect + SSRF chains (trusted URL → redirect → internal IP)
- Enforcing connection timeouts to prevent slow-loris attacks
- Audit-logging all external HTTP calls (pairs with [[http-proxy-intercept]])

## Do NOT use for

- Blocking DNS rebinding (use network namespace + no async DNS lookup after allowlist check)
- Client-side fetch in browser (use CSP + fetch policies instead)

---

## Safe fetch wrapper (no auto-redirect)

```javascript
import fetch, { Response } from 'node-fetch'
import { URL }             from 'url'

const SSRF_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,
  /metadata\.(google\.internal|internal)$/,
]

function isSsrfTarget(host: string): boolean {
  return SSRF_RANGES.some(r => r.test(host))
}

export async function safeFetch(
  url: string,
  options: Parameters<typeof fetch>[1] = {}
): Promise<Response> {
  // 1. Parse and validate initial URL
  let parsed: URL
  try { parsed = new URL(url) }
  catch { throw new Error(`[fetch] invalid URL: ${url}`) }

  if (isSsrfTarget(parsed.hostname)) {
    throw new Error(`[fetch] SSRF blocked: ${parsed.hostname}`)
  }

  // 2. Disable automatic redirect following
  const res = await fetch(url, {
    ...options,
    redirect: 'manual',           // never follow automatically
    follow:   0,                  // node-fetch: 0 = manual
    timeout:  10_000,             // 10s hard timeout
    size:     5 * 1024 * 1024,   // max 5MB response
  })

  // 3. If redirect, validate destination before following
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location')
    if (!location) throw new Error('[fetch] redirect with no Location header')

    const redirectTo = new URL(location, url)
    if (isSsrfTarget(redirectTo.hostname)) {
      throw new Error(`[fetch] SSRF via redirect: ${redirectTo.hostname}`)
    }

    // Follow once (max depth 1 — no chain following)
    return safeFetch(redirectTo.href, { ...options, redirect: 'manual' })
  }

  return res
}
```

---

## Timeout + size enforcement

```javascript
// AbortController for hard timeout (works with native fetch)
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 10_000)

try {
  const res = await fetch(url, { signal: controller.signal })
  clearTimeout(timer)

  // Enforce response size
  const buf = await res.arrayBuffer()
  if (buf.byteLength > 5 * 1024 * 1024) {
    throw new Error('[fetch] response too large')
  }
  return Buffer.from(buf).toString()
} catch (err) {
  clearTimeout(timer)
  throw err
}
```

---

## Anti-Fake-Pass Checklist

```
❌ redirect:'follow' (default) → attacker redirects trusted URL to 169.254.169.254
❌ No hostname validation after redirect → DNS rebinding bypasses initial check
❌ No timeout → agent hangs on slow-loris connection
❌ No response size limit → agent downloads 1GB payload, OOM
❌ URL constructor not used → regex validation on raw string misses edge cases
❌ Only checking IPv4 SSRF ranges → IPv6 fd::/8 and ::1 bypass
❌ redirect depth > 1 → chained redirects tunnel through to internal network
```
