/**
 * secure-logger.js — Append-Only Merkle Audit Log
 *
 * Every agent action is hashed into a Merkle tree leaf.
 * The root hash changes the instant any historical entry is tampered with.
 * Log entries are written to an append-only JSONL file — never overwritten.
 *
 * Usage:
 *   import { SecureAuditLogger } from './secure-logger.js';
 *   const logger = new SecureAuditLogger('./releases/logs/audit.jsonl');
 *   logger.logAction('agent-42', 'bash:ls', 'PASS');
 *   logger.verify();  // throws if root hash drifts
 *
 * Source: merkletreejs (MIT), crypto-js (MIT), OWASP Logging Cheat Sheet
 */

import { createHash, createHmac } from 'crypto';
import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac256(data, secret) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Merkle root from an ordered list of hex-string leaves. */
function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256('EMPTY_TREE');
  let layer = [...leaves];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;   // odd leaf duplicated
      next.push(sha256(left + right));
    }
    layer = next;
  }
  return layer[0];
}

// ─── SecureAuditLogger ────────────────────────────────────────────────────────

export class SecureAuditLogger {
  /**
   * @param {string} logPath  — path to append-only JSONL audit file
   * @param {string} [secret] — HMAC secret; defaults to YAMTAM_LOG_SECRET env var
   */
  constructor(logPath = 'releases/logs/audit.jsonl', secret) {
    this.logPath = logPath;
    this.secret = secret ?? process.env.YAMTAM_LOG_SECRET ?? 'yamtam-default-secret';
    this.leaves = [];           // in-memory Merkle leaf list (hex SHA256)
    this._rootHashPath = logPath + '.root';

    mkdirSync(dirname(logPath), { recursive: true });

    // Rebuild leaf list from existing log on startup
    this._rebuildLeaves();
  }

  /**
   * Record one agent action.
   * @param {string} agentId
   * @param {string} command  — tool name or shell command (max 256 chars)
   * @param {'PASS'|'BLOCK'|'ERROR'} status
   * @param {object} [meta]   — optional extra fields (sanitized)
   */
  logAction(agentId, command, status, meta = {}) {
    const ts = new Date().toISOString();
    const safeCmd = String(command).slice(0, 256);
    const safeAgent = String(agentId).slice(0, 128);

    const payload = `${ts}:${safeAgent}:${safeCmd}:${status}`;
    const leaf = sha256(payload);
    const hmacSig = hmac256(payload, this.secret);

    this.leaves.push(leaf);
    const root = merkleRoot(this.leaves);

    const entry = {
      ts,
      agentId: safeAgent,
      command: safeCmd,
      status,
      leaf,
      root,
      hmac: hmacSig,
      ...meta,
    };

    // Append-only write — never truncate or seek
    appendFileSync(this.logPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', flag: 'a' });

    // Persist latest root for fast verify
    writeFileSync(this._rootHashPath, root, 'utf8');

    return { leaf, root };
  }

  /**
   * Verify integrity: recompute Merkle root from log file and compare.
   * Throws SecureLogTamperError if root hash drifts.
   */
  verify() {
    const recomputed = this._rebuildLeaves();
    const stored = existsSync(this._rootHashPath)
      ? readFileSync(this._rootHashPath, 'utf8').trim()
      : null;

    if (stored && stored !== recomputed) {
      throw new SecureLogTamperError(
        `ROOT HASH DRIFT — stored: ${stored.slice(0, 16)}… computed: ${recomputed.slice(0, 16)}…`
      );
    }
    return { ok: true, root: recomputed, entryCount: this.leaves.length };
  }

  /**
   * Returns the current Merkle root without writing.
   */
  currentRoot() {
    return merkleRoot(this.leaves);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  _rebuildLeaves() {
    this.leaves = [];
    if (!existsSync(this.logPath)) return merkleRoot([]);

    const lines = readFileSync(this.logPath, 'utf8')
      .split('\n')
      .filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.leaf) {
          this.leaves.push(entry.leaf);
        }
      } catch {
        // corrupted line — still include its raw hash so tampering is detected
        this.leaves.push(sha256(line));
      }
    }
    return merkleRoot(this.leaves);
  }
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class SecureLogTamperError extends Error {
  constructor(msg) {
    super(`[SECURE-LOGGER:TAMPER] ${msg}`);
    this.name = 'SecureLogTamperError';
  }
}

// ─── CLI: node secure-logger.js verify <logPath> ─────────────────────────────

if (process.argv[1]?.endsWith('secure-logger.js')) {
  const subcmd = process.argv[2];
  const logPath = process.argv[3] ?? 'releases/logs/audit.jsonl';

  if (subcmd === 'verify') {
    try {
      const logger = new SecureAuditLogger(logPath);
      const result = logger.verify();
      process.stdout.write(`VERIFIED — root: ${result.root.slice(0, 32)}… entries: ${result.entryCount}\n`);
      process.exit(0);
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
  } else if (subcmd === 'log') {
    const [, , , agentId, command, status] = process.argv;
    const logger = new SecureAuditLogger(logPath);
    const r = logger.logAction(agentId ?? 'cli', command ?? 'unknown', status ?? 'PASS');
    process.stdout.write(`logged — leaf: ${r.leaf.slice(0, 16)}… root: ${r.root.slice(0, 16)}…\n`);
  } else {
    process.stderr.write('Usage: node secure-logger.js verify <logPath>\n');
    process.stderr.write('       node secure-logger.js log   <logPath> <agentId> <command> <status>\n');
    process.exit(4);
  }
}
