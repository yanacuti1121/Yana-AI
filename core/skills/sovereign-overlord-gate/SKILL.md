---
name: sovereign-overlord-gate
description: Implement the Sovereign Overlord Gate (Layer 100) — absolute human authority over the entire agent swarm. ECDSA-P384 signed commands, dead-man switch, emergency shutdown, and swarm freeze with one-time nonce authentication.
origin: YAMTAM Engine rule 62, HSM design patterns, NIST SP 800-57
license: Apache-2.0
version: 1.0.0
compatibility: claude-sonnet-4-6, claude-opus-4-7
---

# Sovereign Overlord Gate (Layer 100)

The final authority layer. No agent can override it. One human, one key, absolute control.

## When to Use

- Emergency: compromised agent is causing damage and must be frozen immediately
- Planned maintenance: freeze swarm before infrastructure changes
- Security incident: wipe all agent RAM state and restore from Merkle snapshot
- Releasing a quarantined agent after forensic review

## Do NOT use for

- Routine task approval (use per-task authorization instead)
- Automated scripts (sovereign authority must be human-initiated)

## ECDSA-P384 Sovereign Key Generation

```bash
# Generate sovereign keypair (store private key in hardware HSM or offline)
openssl ecparam -name secp384r1 -genkey -noout -out sovereign.key
openssl ec -in sovereign.key -pubout -out sovereign-verify.pub

# Embed verification key in system (never the signing key)
cat sovereign-verify.pub  # paste into YAMTAM_SOVEREIGN_VERIFY_KEY env
```

## Sovereign Command Signing

```js
import { createSign, createVerify } from 'crypto';

function signSovereignCommand(action, privateKeyPem) {
  const nonce = randomBytes(16).toString('hex');
  const ts    = Date.now();
  const payload = `${action}:${ts}:${nonce}`;

  const signer = createSign('SHA384');
  signer.update(payload);
  const signature = signer.sign(privateKeyPem, 'hex');

  return { action, ts, nonce, signature };
}

function verifySovereignCommand(cmd, publicKeyPem) {
  // Replay attack: nonce must not have been used
  if (usedNonces.has(cmd.nonce)) throw new Error('NONCE_REPLAY');
  // Expiry: 60-second window
  if (Date.now() - cmd.ts > 60000) throw new Error('COMMAND_EXPIRED');

  const payload = `${cmd.action}:${cmd.ts}:${cmd.nonce}`;
  const verifier = createVerify('SHA384');
  verifier.update(payload);
  const valid = verifier.verify(publicKeyPem, cmd.signature, 'hex');
  if (!valid) throw new Error('INVALID_SOVEREIGN_SIGNATURE');

  usedNonces.add(cmd.nonce);
  return true;
}
```

## Sovereign Actions

```js
class SovereignOverlordGate {
  constructor(router, logger, verifyKeyPem) {
    this.router    = router;
    this.logger    = logger;
    this.verifyKey = verifyKeyPem;
    this.usedNonces = new Set();
  }

  execute(signedCmd) {
    verifySovereignCommand(signedCmd, this.verifyKey);
    this.logger.logAction('sovereign', signedCmd.action, 'PASS', signedCmd);

    switch (signedCmd.action) {
      case 'FREEZE_SWARM':
        for (const id of this.router.agents.keys()) {
          this.router.quarantine(id, 'SOVEREIGN_FREEZE');
        }
        break;

      case 'WIPE_AGENT_STATE':
        const agent = this.router.agents.get(signedCmd.target);
        if (agent) {
          agent.trustScore = 0;
          agent.violations = [];
          this.router.quarantine(signedCmd.target, 'SOVEREIGN_WIPE');
        }
        break;

      case 'FULL_ROLLBACK':
        emergencyRollback();   // restore from last Merkle snapshot
        break;

      case 'RELEASE_QUARANTINE':
        this.router.release(signedCmd.target, process.env.YAMTAM_RELEASE_TOKEN);
        break;

      case 'EMERGENCY_SHUTDOWN':
        process.stderr.write('[SOVEREIGN] EMERGENCY SHUTDOWN INITIATED\n');
        process.exit(100);
    }
  }
}
```

## Dead-Man Switch (72-hour Absence Alert)

```js
class SovereignDeadManSwitch {
  constructor(gate, ttl = 72 * 60 * 60 * 1000) {
    this.gate = gate;
    this.lastActivity = Date.now();
    this.ttl = ttl;

    setInterval(() => this._check(), 60 * 60 * 1000);  // check hourly
  }

  touch() { this.lastActivity = Date.now(); }

  _check() {
    const elapsed = Date.now() - this.lastActivity;
    if (elapsed > this.ttl) {
      process.stderr.write('[SOVEREIGN] 72h absence — entering SOVEREIGN_ABSENCE_ALERT\n');
      // Freeze all writes, wait 1 hour for human re-auth
      this.gate.router.agents.forEach((_, id) => {
        const agent = this.gate.router.agents.get(id);
        agent.allowedCommands = new Set(['ls', 'cat']);  // read-only
      });
    }
  }
}
```

## Anti-Fake-Pass Checklist

- [ ] ECDSA-P384 signature verified (not P256 — sovereign uses stronger curve)
- [ ] Nonce stored after use — second use of same nonce throws `NONCE_REPLAY`
- [ ] Command expires after 60s — test with `ts: Date.now() - 61000`
- [ ] `FREEZE_SWARM` confirmed: all agents quarantined (check `router.status().active === 0`)
- [ ] Private signing key NEVER stored in repo, env vars, or agent memory
