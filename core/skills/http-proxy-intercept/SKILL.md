---
name: http-proxy-intercept
description: HTTP/HTTPS proxy interception for agent network traffic. Trap outbound requests, inspect headers/bodies, enforce domain allowlists, inject auth tokens, and block SSRF targets. Sources: http-party/node-http-proxy.
origin: yana-ai — synthesized from http-party/node-http-proxy (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /http-proxy-intercept

## When to Use

- Intercept all HTTP calls from agent tools before they leave the sandbox
- Enforce domain allowlist (only api.github.com, registry.npmjs.org, etc.)
- Inject tracing headers (X-Agent-Session, X-Request-ID) on every outbound call
- Log all external calls for audit trail (Gate L3 network-egress-law)

## Do NOT use for

- Encrypted TLS inspection without certificate pinning setup
- Replacing [[network-isolation-vpnkit]] for full network namespace isolation

---

## Allowlist proxy server

```javascript
import httpProxy from 'http-proxy'
import http       from 'http'
import { URL }    from 'url'

const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'registry.npmjs.org',
  'pypi.org',
  'objects.githubusercontent.com',
])

// SSRF blocked ranges (sync with network-egress-law)
const SSRF_PREFIXES = ['169.254.','127.','10.','192.168.','172.16.','::1','fd00:']
const isSSRF = (host: string) => SSRF_PREFIXES.some(p => host.startsWith(p))

const proxy = httpProxy.createProxyServer({})

const server = http.createServer((req, res) => {
  const target = req.url ?? ''
  let host: string

  try {
    host = new URL(target).hostname
  } catch {
    res.writeHead(400); res.end('Bad URL'); return
  }

  if (isSSRF(host)) {
    res.writeHead(403); res.end(`SSRF blocked: ${host}`); return
  }

  if (!ALLOWED_HOSTS.has(host)) {
    res.writeHead(403); res.end(`Domain not in allowlist: ${host}`); return
  }

  // Inject tracing header
  req.headers['x-agent-session'] = process.env.YAMTAM_SESSION_ID ?? 'unknown'
  req.headers['x-forwarded-by']  = 'yamtam-proxy'

  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    console.error('[proxy] error:', err.message)
    res.writeHead(502); res.end('Proxy error')
  })
})

server.listen(8080, '127.0.0.1', () => {
  console.log('[proxy] listening on 127.0.0.1:8080')
})
```

---

## Configuring agent to use proxy

```bash
# Set via environment variable — most HTTP clients respect these
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080
export NO_PROXY=localhost,127.0.0.1

# For curl
curl --proxy http://127.0.0.1:8080 https://api.github.com/zen

# For Node.js fetch (node-fetch / undici)
> ⚠ YAMTAM: NODE_OPTIONS is a Tier A protected variable (env-integrity-policy.md). Requires env-whitelist.json approval before use.
export NODE_OPTIONS="--proxy http://127.0.0.1:8080"
```

---

## Request logging middleware

```javascript
proxy.on('proxyReq', (proxyReq, req) => {
  const ts  = new Date().toISOString()
  const url = req.url ?? ''
  const log = JSON.stringify({ ts, method: req.method, url, session: req.headers['x-agent-session'] })
  process.stdout.write(log + '\n')
})

proxy.on('proxyRes', (proxyRes, req) => {
  const log = JSON.stringify({ status: proxyRes.statusCode, url: req.url })
  process.stdout.write(log + '\n')
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Proxy bound to 0.0.0.0 → accessible to all network interfaces, not just localhost
❌ No SSRF check → agent proxies 169.254.169.254 through your allowlist proxy
❌ changeOrigin:false → Host header reveals internal proxy to external server
❌ No error handler on proxy.web() → unhandled promise rejection crashes server
❌ HTTP_PROXY set but agent uses https.request directly → proxy bypassed
❌ Allowlist empty → all requests pass through (allowlist must be explicit)
```
