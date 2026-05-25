---
name: merkle-tree-audit
description: Merkle tree construction for tamper-evident audit logs. Build Merkle root from audit log hashes, proof generation and verification, incremental append, and integrating with secure-logger.sh for L0 hash-chain integrity. Sources: miguelmota/merkletreejs.
origin: yamtam-engine — synthesized from miguelmota/merkletreejs (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /merkle-tree-audit

## When to Use

- Convert secure-logger.sh audit log entries into a Merkle tree root hash
- Prove a specific log entry exists in the audit log without revealing all entries
- Detect any modification to historical audit entries (root hash changes)
- Build tamper-evident audit checkpoints for regulatory compliance

## Do NOT use for

- Real-time log streaming (Merkle tree is built on completed log batches)
- Replacing append-only storage (use [[append-only-hypercore]] for that)

---

## Build Merkle tree from log hashes

```javascript
import { MerkleTree } from 'merkletreejs'
import { createHash }  from 'crypto'
import { readFileSync } from 'fs'

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest()
}

function buildAuditTree(logFile: string): { root: string; tree: MerkleTree } {
  const lines  = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
  const leaves = lines.map(line => sha256(line))

  const tree = new MerkleTree(leaves, sha256, {
    sortPairs: true,    // deterministic — order-independent root
    hashLeaves: false,  // leaves are already hashed
  })

  return { root: tree.getRoot().toString('hex'), tree }
}

const { root, tree } = buildAuditTree('releases/logs/agent-audit.json')
console.log('[merkle] audit root:', root)
```

---

## Generate proof for a specific entry

```javascript
function proveEntry(
  tree:    MerkleTree,
  logLine: string
): { proof: string[]; valid: boolean } {
  const leaf  = sha256(logLine)
  const proof = tree.getProof(leaf).map(p => ({
    data:     p.data.toString('hex'),
    position: p.position,
  }))

  const root  = tree.getRoot()
  const valid = tree.verify(tree.getProof(leaf), leaf, root)

  return { proof: proof.map(p => p.data), valid }
}
```

---

## Verify proof independently

```javascript
function verifyEntryProof(
  logLine:   string,
  proofHexes: string[],
  rootHex:   string
): boolean {
  const leaf  = sha256(logLine)
  const root  = Buffer.from(rootHex, 'hex')
  const proof = proofHexes.map(h => ({ data: Buffer.from(h, 'hex') }))

  const tree  = new MerkleTree([], sha256, { sortPairs: true })
  return tree.verify(proof, leaf, root)
}
```

---

## Periodic checkpoint in secure-logger.sh

```bash
#!/usr/bin/env bash
# checkpoint-audit.sh — build Merkle root from today's audit log
LOG_FILE="releases/logs/agent-audit-$(date +%Y-%m-%d).json"
CHECKPOINT_FILE="releases/logs/merkle-checkpoints.json"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "[checkpoint] no log for today"
  exit 0
fi

ROOT=$(node -e "
const { MerkleTree } = require('merkletreejs')
const { createHash, readFileSync } = require('crypto'), fs = require('fs')
const lines  = fs.readFileSync('$LOG_FILE','utf8').trim().split('\n').filter(Boolean)
const leaves = lines.map(l => createHash('sha256').update(l).digest())
const tree   = new MerkleTree(leaves, d => createHash('sha256').update(d).digest(), { sortPairs: true })
console.log(tree.getRoot().toString('hex'))
")

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "{\"ts\":\"$TS\",\"log\":\"$LOG_FILE\",\"root\":\"$ROOT\"}" >> "$CHECKPOINT_FILE"
echo "[checkpoint] root=$ROOT"
```

---

## Anti-Fake-Pass Checklist

```
❌ sortPairs:false → root depends on insertion order → non-deterministic between restarts
❌ hashLeaves:true when leaves already hashed → double-hashed, proof verification fails
❌ Empty log file → empty tree → root is empty string, not a valid checkpoint
❌ Proof verified against stale root → passes even if tree was rebuilt with modifications
❌ No checkpoint persistence → root lost on restart, cannot verify historical entries
❌ Merkle root alone without timestamp → cannot determine which log version was attested
```
