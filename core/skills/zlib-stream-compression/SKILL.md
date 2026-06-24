---
name: zlib-stream-compression
description: Node.js zlib streaming compression for log rotation and release packaging. Gzip/Brotli/Deflate transform streams, compression level tuning, streaming decompress, and on-the-fly log archiving. Sources: Node.js zlib module, madler/zlib.
origin: yana-ai — synthesized from Node.js zlib docs (MIT), madler/zlib (zlib License)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /zlib-stream-compression

## When to Use

- Compress audit logs before rotation (gzip → 10-50× smaller)
- Compress HTTP response bodies in agent proxy/server middleware
- On-the-fly Brotli compression for release artifacts
- Decompress API responses that return gzip/deflate Content-Encoding

## Do NOT use for

- Whole-archive packaging (use [[archive-stream-patterns]] with archiver)
- Encryption (compression ≠ security — use AES after compress)

---

## Gzip log file

```javascript
import { createGzip, createGunzip } from 'zlib'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

async function gzipFile(input: string, output?: string): Promise<void> {
  const dest = output ?? `${input}.gz`
  await pipeline(
    createReadStream(input),
    createGzip({ level: 6 }),   // 1=fast, 9=best compression
    createWriteStream(dest)
  )
}

async function gunzipFile(input: string, output: string): Promise<void> {
  await pipeline(
    createReadStream(input),
    createGunzip(),
    createWriteStream(output)
  )
}
```

---

## Brotli (better ratio than gzip for text)

```javascript
import { createBrotliCompress, createBrotliDecompress, constants } from 'zlib'

async function brotliFile(input: string, output?: string): Promise<void> {
  const dest = output ?? `${input}.br`
  await pipeline(
    createReadStream(input),
    createBrotliCompress({
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 6,   // 0-11, 11=max
        [constants.BROTLI_PARAM_SIZE_HINT]: 0,
      },
    }),
    createWriteStream(dest)
  )
}
```

---

## Compress HTTP response (middleware)

```javascript
import { createGzip } from 'zlib'

function gzipMiddleware(req: any, res: any, next: any): void {
  const acceptEncoding = req.headers['accept-encoding'] ?? ''
  if (!acceptEncoding.includes('gzip')) { next(); return }

  res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Vary', 'Accept-Encoding')

  const gz = createGzip()
  gz.pipe(res)

  const origWrite = res.write.bind(res)
  const origEnd   = res.end.bind(res)
  res.write = (chunk: any) => gz.write(chunk)
  res.end   = (chunk?: any) => { if (chunk) gz.write(chunk); gz.end() }

  next()
}
```

---

## Log rotation with compression

```bash
# Compress yesterday's log with gzip
gzip -6 releases/logs/tool-proxy.$(date -d yesterday +%Y-%m-%d).log

# Or with zstd (faster than gzip, better ratio)
zstd --rm -q releases/logs/audit.log
```

---

## Anti-Fake-Pass Checklist

```
❌ createGzip() sync API (zlib.gzipSync) on large files → blocks event loop
❌ Level 9 on hot path → CPU cost too high; use level 4-6 for balance
❌ Brotli quality 11 for real-time → 10× slower than quality 6
❌ pipeline not used → stream errors don't propagate, source not destroyed
❌ HTTP middleware: res.end called twice → double-flush causes response corruption
❌ Decompressing untrusted gzip → zip bomb risk; set maxOutputLength
```
