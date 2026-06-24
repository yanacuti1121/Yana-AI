---
name: archive-stream-patterns
description: Streaming ZIP and TAR archive creation for agent release packaging. node-archiver streaming API, append files/directories, compression levels, progress events, and integrity verification. Sources: archiverjs/node-archiver.
origin: yana-ai — synthesized from archiverjs/node-archiver (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /archive-stream-patterns

## When to Use

- Building yamtam release packages (zip skills + rules + scripts into versioned archive)
- Streaming archive creation without loading entire archive into RAM
- Progressively adding files to archive during agent session
- Replacing synchronous zip tools with event-driven streaming approach

## Do NOT use for

- Extracting/reading existing archives (use [[zip-memory-operations]] for in-memory ops)
- Archives > 4GB (ZIP32 limit — use TAR.GZ instead)

---

## Create release ZIP

```javascript
import archiver   from 'archiver'
import { createWriteStream } from 'fs'
import { resolve }           from 'path'

async function createRelease(
  projectRoot: string,
  outputPath:  string,
  version:     string
): Promise<{ bytes: number; fileCount: number }> {
  return new Promise((res, rej) => {
    const output  = createWriteStream(outputPath)
    const archive = archiver('zip', {
      zlib: { level: 6 },   // 0=store, 9=max compression
    })

    let fileCount = 0

    output.on('close', () => res({ bytes: archive.pointer(), fileCount }))
    archive.on('error',   rej)
    archive.on('entry',   () => fileCount++)
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') rej(err)
    })

    archive.pipe(output)

    // Add directories
    archive.directory(resolve(projectRoot, 'core/skills'),  `yamtam-${version}/skills`)
    archive.directory(resolve(projectRoot, 'core/rules'),   `yamtam-${version}/rules`)
    archive.directory(resolve(projectRoot, 'core/scripts'), `yamtam-${version}/scripts`)

    // Add specific files
    archive.file(resolve(projectRoot, 'MANIFEST.json'), { name: `yamtam-${version}/MANIFEST.json` })
    archive.file(resolve(projectRoot, 'README.md'),     { name: `yamtam-${version}/README.md` })

    archive.finalize()
  })
}
```

---

## TAR.GZ for large archives

```javascript
const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
const output  = createWriteStream('/tmp/yamtam-release.tar.gz')
archive.pipe(output)
archive.glob('**/*', { cwd: projectRoot, ignore: ['node_modules/**', 'releases/logs/**'] })
await new Promise((res, rej) => {
  output.on('close', res)
  archive.on('error', rej)
  archive.finalize()
})
```

---

## Progress reporting

```javascript
archive.on('progress', (progress) => {
  const pct = ((progress.entries.processed / progress.entries.total) * 100).toFixed(0)
  process.stdout.write(`\r[archive] ${pct}% (${progress.entries.processed}/${progress.entries.total} files)`)
})
```

---

## Integrity check after creation

```bash
# Verify zip integrity after archiver finishes
unzip -t /tmp/yamtam-release.zip | tail -1
# → No errors detected in /tmp/yamtam-release.zip

# Check tar integrity
tar -tzf /tmp/yamtam-release.tar.gz > /dev/null && echo "TAR OK"
```

---

## Anti-Fake-Pass Checklist

```
❌ No error handler on archive object → unhandled rejection crashes process
❌ archive.finalize() before all .file()/.directory() calls → truncated archive
❌ output stream not piped before adding files → buffering fills RAM
❌ No 'close' on output stream → promise resolves before file is flushed to disk
❌ ZIP > 4GB → use TAR.GZ (archiver zip format uses 32-bit file sizes)
❌ node_modules/ not excluded → 50MB archive becomes 1GB
```
