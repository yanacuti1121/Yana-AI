---
name: stream-to-buffer-patterns
description: Safely collect stream data into a string or buffer. get-stream patterns, size limits to prevent OOM, encoding handling, binary vs text streams, and timeout guards. Sources: sindresorhus/get-stream.
origin: yamtam-engine — synthesized from sindresorhus/get-stream (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /stream-to-buffer-patterns

## When to Use

- Collect stdout/stderr from child_process into a string safely
- Read HTTP response body stream into buffer with size cap
- Buffer tool output before parsing (JSON, YAML, CSV)
- Enforce max response size to prevent agent OOM on large downloads

## Do NOT use for

- Large binary files > 50MB (stream directly to disk instead)
- Real-time line-by-line processing (use readline interface instead)

---

## get-stream (with size limit)

```javascript
import getStream from 'get-stream'
import { spawn }  from 'child_process'

async function runAndCapture(cmd: string, args: string[]): Promise<string> {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  // Cap output at 5MB to prevent OOM
  const [stdout, stderr] = await Promise.all([
    getStream(child.stdout!, { maxBuffer: 5 * 1024 * 1024 }),
    getStream(child.stderr!, { maxBuffer: 1 * 1024 * 1024 }),
  ])

  await new Promise((res, rej) => {
    child.on('close', code => code === 0 ? res(null) : rej(new Error(`exit ${code}: ${stderr}`)))
  })

  return stdout
}
```

---

## get-stream.buffer (binary)

```javascript
import { buffer as getBuffer } from 'get-stream'

async function downloadToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
  return getBuffer(readableStream, { maxBuffer: 10 * 1024 * 1024 })
  // throws MaxBufferError if > 10MB
}
```

---

## DIY buffer collector (no dependency)

```javascript
function streamToString(
  stream:    NodeJS.ReadableStream,
  maxBytes = 5 * 1024 * 1024
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        stream.destroy()
        reject(new Error(`[stream] max size exceeded: ${total} > ${maxBytes}`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}
```

---

## Handle encoding correctly

```javascript
// UTF-8 string output
const text = await getStream(stream, { encoding: 'utf8' })

// Binary (no encoding — returns Buffer via getStream.buffer)
const buf = await getBuffer(stream)

// JSON output with parse
const json = JSON.parse(await getStream(stream, { maxBuffer: 1_048_576 }))
```

---

## Anti-Fake-Pass Checklist

```
❌ No maxBuffer → getStream collects unlimited bytes → OOM on large output
❌ MaxBufferError not caught → unhandled rejection kills process
❌ stream.resume() not called if stream is paused → getStream hangs forever
❌ Binary stream with encoding:'utf8' → corrupts multi-byte chars at chunk boundaries
❌ child.stdout null when stdio:'ignore' → must use 'pipe' for stdout capture
❌ Promise not awaiting child close → resolve fires before process exits
```
