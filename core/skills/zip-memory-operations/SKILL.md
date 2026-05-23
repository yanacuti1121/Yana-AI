---
name: zip-memory-operations
description: In-memory ZIP read/write operations without temp files. adm-zip patterns for extracting, modifying, and inspecting ZIP archives entirely in RAM — ideal for release package verification. Sources: cthackers/adm-zip.
origin: yamtam-engine — synthesized from cthackers/adm-zip (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /zip-memory-operations

## When to Use

- Inspect yamtam release ZIP contents without extracting to disk
- Patch a single file inside a ZIP (update MANIFEST.json in release archive)
- Verify release archive integrity and file list before publishing
- Extract specific files from ZIP into memory buffers for validation

## Do NOT use for

- Large archives (> 500MB in memory) — use streaming [[archive-stream-patterns]]
- Creating new archives from scratch (use node-archiver for streaming creation)

---

## Inspect archive

```javascript
import AdmZip from 'adm-zip'

function inspectRelease(zipPath: string): void {
  const zip     = new AdmZip(zipPath)
  const entries = zip.getEntries()

  console.log(`[zip] ${entries.length} entries in ${zipPath}`)
  entries.forEach(e => {
    console.log(`  ${e.entryName.padEnd(60)} ${e.header.size.toLocaleString()} bytes`)
  })
}
```

---

## Extract single file to memory

```javascript
function readFromZip(zipPath: string, entryName: string): string {
  const zip   = new AdmZip(zipPath)
  const entry = zip.getEntry(entryName)
  if (!entry) throw new Error(`[zip] entry not found: ${entryName}`)
  return zip.readAsText(entry)
}

// Verify MANIFEST.json in release archive
const manifest = JSON.parse(
  readFromZip('/tmp/yamtam-1.3.48.zip', 'yamtam-1.3.48/MANIFEST.json')
)
console.log('Release version:', manifest.version)
```

---

## Patch file inside ZIP (in-memory)

```javascript
function patchZipEntry(
  zipPath:   string,
  entryName: string,
  content:   string,
  outputPath?: string
): void {
  const zip = new AdmZip(zipPath)
  zip.updateFile(entryName, Buffer.from(content, 'utf8'))
  zip.writeZip(outputPath ?? zipPath)  // overwrite or new path
}

// Update MANIFEST version in release zip
patchZipEntry(
  '/tmp/yamtam-1.3.48.zip',
  'yamtam-1.3.48/MANIFEST.json',
  JSON.stringify({ ...manifest, manifest_updated: new Date().toISOString() }, null, 2)
)
```

---

## Verify file checksums in archive

```javascript
import { createHash } from 'crypto'

function verifyZipContents(
  zipPath:  string,
  expected: Record<string, string>  // entryName → sha256 hex
): { ok: boolean; failures: string[] } {
  const zip      = new AdmZip(zipPath)
  const failures: string[] = []

  for (const [entry, expectedHash] of Object.entries(expected)) {
    const data = zip.readFile(entry)
    if (!data) { failures.push(`${entry}: MISSING`); continue }
    const actual = createHash('sha256').update(data).digest('hex')
    if (actual !== expectedHash) failures.push(`${entry}: hash mismatch`)
  }

  return { ok: failures.length === 0, failures }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ new AdmZip() on 1GB file → loads entire archive into RAM → OOM
❌ zip.getEntry() returns null for wrong path separator (/ vs \) → use / consistently
❌ zip.readFile() returns null not empty buffer → null check required
❌ writeZip() overwrites source while reading from it → use separate output path
❌ No CRC verification on extraction → corrupted entries silently extracted
❌ Password-protected ZIPs — adm-zip supports basic encryption but not AES-256
```
