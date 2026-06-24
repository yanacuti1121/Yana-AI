---
name: zk-proof-patterns
description: Zero-Knowledge Proof patterns for privacy-preserving agent attestation. snarkjs circuit compilation, proof generation, verification, and agent compliance attestation without revealing sensitive source code. Sources: iden3/snarkjs.
origin: yana-ai — synthesized from iden3/snarkjs (GPL-3.0), Groth16/PLONK ZK-SNARK literature
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /zk-proof-patterns

## When to Use

- Prove an agent executed a security scan correctly without revealing scan targets
- Prove a rule was applied without exposing the rule's logic to a third party
- Attestation: "I processed input X with algorithm Y and got hash Z" — verifiable without X
- Future-proof: prove yamtam audit compliance to external auditor with zero data exposure

## Do NOT use for

- Simple integrity checks (use [[merkle-tree-audit]] or HMAC instead)
- Real-time tool calls (ZK proof generation takes seconds to minutes)

---

## Concept: ZK attestation for agent audit

```
Traditional audit: "Agent scanned /workspaces/secrets.env for violations."
                   → auditor can see the file path and content

ZK audit:          "Agent ran compliance-check circuit on input H and produced result R."
                   → auditor only sees hash H and pass/fail result R
                   → cannot reverse-engineer the input from H
```

---

## Circuit (circom language — compiled to R1CS)

```circom
// compliance_check.circom
pragma circom 2.0.0;

// Prove: sha256(input) == expected_hash WITHOUT revealing input
template ComplianceCheck() {
    signal input  secretInput[256];   // private: the actual content
    signal input  expectedHash[256];  // public: known hash
    signal output isCompliant;        // public: 1 = passed, 0 = failed

    component hasher = Sha256(256);
    for (var i = 0; i < 256; i++) {
        hasher.in[i] <== secretInput[i];
    }
    for (var i = 0; i < 256; i++) {
        hasher.out[i] === expectedHash[i];
    }
    isCompliant <== 1;
}

component main { public [expectedHash] } = ComplianceCheck();
```

---

## Generate proof (Node.js)

```javascript
import { groth16 } from 'snarkjs'
import { readFileSync } from 'fs'

// Prerequisites (generated offline from circuit):
// - compliance_check.wasm  (circuit compiled to WASM)
// - compliance_check_final.zkey  (proving key from trusted setup)

async function generateComplianceProof(
  secretInputBits: number[],   // private: actual scan data as bits
  expectedHashBits: number[]   // public: known expected hash
): Promise<{ proof: object; publicSignals: string[] }> {

  const { proof, publicSignals } = await groth16.fullProve(
    {
      secretInput: secretInputBits,
      expectedHash: expectedHashBits,
    },
    'compliance_check.wasm',
    'compliance_check_final.zkey'
  )

  return { proof, publicSignals }
}
```

---

## Verify proof

```javascript
async function verifyComplianceProof(
  proof:         object,
  publicSignals: string[]
): Promise<boolean> {
  const vkey = JSON.parse(readFileSync('compliance_check_verification_key.json', 'utf8'))
  return groth16.verify(vkey, publicSignals, proof)
}
```

---

## Trusted setup ceremony (offline)

```bash
# 1. Compile circuit
circom compliance_check.circom --r1cs --wasm --sym

# 2. Powers of Tau (public ceremony — use existing ptau file)
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="yamtam"
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau

# 3. Circuit-specific setup
snarkjs groth16 setup compliance_check.r1cs pot12_final.ptau compliance_check_0000.zkey
snarkjs zkey contribute compliance_check_0000.zkey compliance_check_final.zkey
snarkjs zkey export verificationkey compliance_check_final.zkey compliance_check_verification_key.json
```

---

## Anti-Fake-Pass Checklist

```
❌ Skipping trusted setup ceremony → weak proving key, proofs forgeable
❌ Proof generation without WASM → native binary required for performance
❌ publicSignals includes private data → defeats ZK privacy guarantee
❌ Verification key not distributed to verifier → verifier cannot check proof
❌ Circuit not audited for constraints → under-constrained circuits allow fake proofs
❌ Groth16 vs PLONK: Groth16 needs per-circuit ceremony; PLONK is universal setup
```
