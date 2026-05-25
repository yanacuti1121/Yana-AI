---
name: keccak256-hash-patterns
description: Keccak256 and ethers.js cryptographic utilities for hash-chain integrity. keccak256 of log entries, ABI encoding, hex data manipulation, event topic hashing, and Ethereum-compatible hash structures. Sources: ethers-io/ethers.js.
origin: yamtam-engine — synthesized from ethers-io/ethers.js (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /keccak256-hash-patterns

## When to Use

- Hash audit log entries with keccak256 for Ethereum-compatible hash-chain
- ABI-encode structured data before hashing (type-safe encoding)
- Compute event topic hashes for on-chain log verification
- Generate deterministic IDs from structured agent action data

## Do NOT use for

- Non-Ethereum contexts — prefer SHA-256 (standard, no dependency)
- Large data hashing — keccak256 is designed for 32-byte outputs

---

## keccak256 of log entries

```javascript
import { ethers } from 'ethers'

// Hash a log entry (string → bytes32 hex)
function hashLogEntry(entry: object): string {
  const json = JSON.stringify(entry, Object.keys(entry).sort())  // sorted for determinism
  return ethers.keccak256(ethers.toUtf8Bytes(json))
}

// Hash chain: each entry hashes previous hash + current data
function buildHashChain(entries: object[]): string[] {
  const chain: string[] = []
  let prev = '0x' + '0'.repeat(64)  // genesis hash

  for (const entry of entries) {
    const current = hashLogEntry(entry)
    const linked  = ethers.keccak256(
      ethers.concat([
        ethers.getBytes(prev),
        ethers.getBytes(current),
      ])
    )
    chain.push(linked)
    prev = linked
  }
  return chain
}
```

---

## ABI encoding for structured hashing

```javascript
import { ethers } from 'ethers'

// Type-safe ABI encoding before hashing (EIP-712 style)
function hashAgentAction(action: {
  agentId:   string
  command:   string
  timestamp: number
  nonce:     number
}): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'string', 'uint256', 'uint256'],
    [action.agentId, action.command, action.timestamp, action.nonce]
  )
  return ethers.keccak256(encoded)
}
```

---

## Event topic hash (EVM-compatible)

```javascript
// Compute topic0 for log filtering (matches Solidity keccak256 of event signature)
const eventSig   = 'AgentCommandExecuted(address,string,uint256)'
const topic0     = ethers.id(eventSig)  // same as keccak256(toUtf8Bytes(sig))
console.log('topic0:', topic0)
```

---

## Verify hash chain integrity

```javascript
function verifyHashChain(entries: object[], storedChain: string[]): boolean {
  if (entries.length !== storedChain.length) return false
  const recomputed = buildHashChain(entries)
  return recomputed.every((h, i) => h === storedChain[i])
}
```

---

## Hex utilities

```javascript
// Pad to bytes32
const padded   = ethers.zeroPadValue(ethers.toBeHex(12345), 32)
// Hex → bytes
const bytes    = ethers.getBytes('0xdeadbeef')
// Bytes → hex
const hex      = ethers.hexlify(Buffer.from('hello'))
// Concat bytes
const combined = ethers.concat([bytes1, bytes2])
```

---

## Anti-Fake-Pass Checklist

```
❌ JSON.stringify without sorted keys → same object, different hash (non-deterministic)
❌ keccak256 of undefined → ethers throws, crashes hash chain build
❌ ethers.id() vs ethers.keccak256(toUtf8Bytes()) — same result, but id() is cleaner
❌ ABI encode types not matching data — silently pads/truncates numbers
❌ ethers v5 vs v6 API differ significantly — check version (v6: ethers.keccak256, not utils.keccak256)
❌ Chain broken at index N → all subsequent hashes wrong (must restart from last valid checkpoint)
```
