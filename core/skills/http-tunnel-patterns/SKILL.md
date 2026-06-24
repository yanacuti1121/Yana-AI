---
name: http-tunnel-patterns
description: HTTP/HTTPS tunneling and SOCKS5 proxy for agent network routing. CONNECT tunnel setup, TLS over HTTP proxy, agent-specific proxy routing, and secure tunnel authentication. Sources: request/request (tunneling patterns), node-tunnel.
origin: yana-ai — synthesized from request/request tunneling internals (Apache-2.0), CONNECT RFC 7231
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /http-tunnel-patterns

## When to Use

- Route agent HTTPS traffic through a corporate proxy (CONNECT method)
- Create encrypted tunnels for agent-to-agent communication in Codespaces
- Bypass network restrictions while maintaining auditability
- Pair with [[http-proxy-intercept]] for full agent traffic inspection

## Do NOT use for

- Public internet traffic without authentication (tunnels expose internal services)
- Bypassing security controls without authorization

---

## HTTP CONNECT tunnel (native Node.js)

```javascript
import http  from 'http'
import https from 'https'
import net   from 'net'
import { TLSSocket } from 'tls'

function createTunnel(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host:   proxyHost,
      port:   proxyPort,
      method: 'CONNECT',
      path:   `${targetHost}:${targetPort}`,
      headers: { 'Proxy-Authorization': `Basic ${Buffer.from('user:pass').toString('base64')}` },
    })

    req.on('connect', (_res, socket) => {
      // socket is a raw TCP tunnel through the proxy
      resolve(socket)
    })

    req.on('error', reject)
    req.end()
  })
}
```

---

## HTTPS over HTTP proxy (using tunnel)

```javascript
import tunnel from 'tunnel'
import https  from 'https'

const agent = tunnel.httpsOverHttp({
  proxy: {
    host: 'proxy.internal',
    port: 8080,
    proxyAuth: `${process.env.PROXY_USER}:${process.env.PROXY_PASS}`,
  },
})

https.get({
  host:  'api.github.com',
  path:  '/zen',
  agent,
  headers: { 'User-Agent': 'yamtam-agent' },
}, (res) => {
  res.pipe(process.stdout)
})
```

---

## SOCKS5 proxy (socks library)

```javascript
import { SocksProxyAgent } from 'socks-proxy-agent'
import fetch from 'node-fetch'

const agent = new SocksProxyAgent('socks5://user:pass@127.0.0.1:1080')

const res = await fetch('https://api.github.com/zen', { agent })
const text = await res.text()
```

---

## Verify tunnel is active

```bash
# Test CONNECT tunnel manually
curl -x http://proxy.internal:8080 \
  --proxy-user "user:pass" \
  https://api.github.com/zen
```

---

## Anti-Fake-Pass Checklist

```
❌ CONNECT without Proxy-Authorization → 407 on authenticated proxies
❌ Tunnel socket not destroyed on error → fd leak
❌ TLS not verified over tunnel → MITM possible on proxy-to-target segment
❌ SOCKS5 without authentication → anyone on the network can use the proxy
❌ tunnel npm package vs node-tunnel — different APIs, don't confuse
❌ HTTP_PROXY env var not honored by https.request — must set agent explicitly
```
