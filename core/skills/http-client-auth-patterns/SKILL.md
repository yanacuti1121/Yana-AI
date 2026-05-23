---
name: http-client-auth-patterns
description: HTTP client with authentication, retry, progress, and request pipeline patterns. superagent bearer token injection, multipart uploads, response validation, and timeout enforcement for agent API calls. Sources: ladjs/superagent.
origin: yamtam-engine — synthesized from ladjs/superagent (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /http-client-auth-patterns

## When to Use

- Agent API calls requiring Bearer token, Basic auth, or API key headers
- File/multipart upload from agent sandbox to external service
- Request/response interceptors for uniform auth injection
- Chained retry with exponential backoff on 429/503

## Do NOT use for

- Simple fetch (use native fetch/node-fetch for basic GETs)
- High-volume parallel requests (use undici connection pools)

---

## Bearer token + timeout

```javascript
import request from 'superagent'

async function callAPI<T>(path: string): Promise<T> {
  const res = await request
    .get(`https://api.github.com${path}`)
    .set('Authorization', `Bearer ${process.env.GITHUB_TOKEN}`)
    .set('User-Agent',     'yamtam-agent/1.3.48')
    .set('Accept',         'application/vnd.github.v3+json')
    .timeout({ response: 10_000, deadline: 30_000 })
    .retry(2)  // 2 retries on network errors

  return res.body as T
}
```

---

## POST with JSON body

```javascript
const res = await request
  .post('https://api.anthropic.com/v1/messages')
  .set('x-api-key',          process.env.ANTHROPIC_API_KEY!)
  .set('anthropic-version',  '2023-06-01')
  .set('Content-Type',       'application/json')
  .send({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [/* ... */] })
  .timeout({ response: 60_000, deadline: 120_000 })

console.log(res.body.content[0].text)
```

---

## Response validation

```javascript
const res = await request.get(url).set(headers)

if (res.status !== 200) {
  throw new Error(`[api] unexpected status: ${res.status} ${res.text}`)
}
if (!res.type.includes('application/json')) {
  throw new Error(`[api] expected JSON, got: ${res.type}`)
}
```

---

## Multipart file upload

```javascript
const res = await request
  .post('https://uploads.example.com/files')
  .set('Authorization', `Bearer ${token}`)
  .attach('file', '/tmp/release.zip', { filename: 'yamtam-1.3.48.zip' })
  .field('version', '1.3.48')
  .timeout({ deadline: 120_000 })
```

---

## Anti-Fake-Pass Checklist

```
❌ No timeout → request hangs indefinitely if server is slow
❌ retry() retries on all errors including 4xx → retry only for network/5xx
❌ .send() with object auto-sets Content-Type: application/json — don't double-set
❌ response vs deadline timeout: response = time to first byte, deadline = total
❌ token hardcoded in source → use process.env and validate at startup
❌ No status check after request → 404/500 bodies treated as success
```
