/**
 * trust-ledger.js — Persistent Agent Reputation Engine
 *
 * Persists trust scores to trust-ledger.json. Integrates with SwarmRouter
 * for auto-quarantine when score drops below threshold (default: 60).
 *
 * Scoring policy (from trust-ledger.json _meta.policy.events):
 *   SMOKE_TEST_PASS     +5   — agent passed a clean smoke test
 *   AST_WARN           -10   — mild dangerous-pattern detection
 *   PATH_TRAVERSAL     -15   — attempted path traversal
 *   CALL_DEPTH_EXCEEDED-20   — recursion depth violation
 *   HONEY_VAULT_TRIP   -40   — touched a honey-vault canary token
 *   CANARY_PROBE_ACCEPT-40   — accepted a honeynet decoy prompt
 *   POLICY_VIOLATION   -25   — generic rule breach
 *
 * Usage:
 *   import { TrustLedger } from './trust-ledger.js';
 *   const ledger = new TrustLedger('./core/memory/trust-ledger.json');
 *   ledger.register('agent-42');
 *   ledger.event('agent-42', 'AST_WARN');  // auto-penalizes, saves, quarantines if <60
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const DEFAULT_LEDGER_PATH = new URL('./trust-ledger.json', import.meta.url).pathname;

export class TrustLedger {
  /**
   * @param {string} [ledgerPath]
   * @param {import('../bus/swarm-router.js').SwarmRouter} [router] — optional live router ref
   */
  constructor(ledgerPath = DEFAULT_LEDGER_PATH, router = null) {
    this.path   = ledgerPath;
    this.router = router;
    this._data  = this._load();
  }

  // ─── Load / Save ────────────────────────────────────────────────────────────

  _load() {
    if (!existsSync(this.path)) {
      throw new Error(`TrustLedger: file not found at ${this.path}`);
    }
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }

  _save() {
    this._data._meta.updated = new Date().toISOString();
    writeFileSync(this.path, JSON.stringify(this._data, null, 2), 'utf8');
  }

  // ─── Agent lifecycle ────────────────────────────────────────────────────────

  register(agentId, opts = {}) {
    if (this._data.agents[agentId]) return;
    this._data.agents[agentId] = {
      id:          agentId,
      role:        opts.role ?? 'executor',
      score:       this._data._meta.policy.default_score,
      quarantined: false,
      events:      [],
      registeredAt: new Date().toISOString(),
    };
    this._save();
  }

  get(agentId) {
    return this._data.agents[agentId] ?? null;
  }

  all() {
    return Object.values(this._data.agents);
  }

  // ─── Scoring ────────────────────────────────────────────────────────────────

  /**
   * Apply a named policy event to an agent.
   * @param {string} agentId
   * @param {string} eventName   — key from policy.events
   * @param {string} [detail]    — extra context for audit trail
   */
  event(agentId, eventName, detail = '') {
    const agent = this._getOrCreate(agentId);
    const delta = this._data._meta.policy.events[eventName] ?? 0;

    const before = agent.score;
    agent.score = Math.max(
      this._data._meta.policy.min_score,
      Math.min(this._data._meta.policy.max_score, agent.score + delta)
    );

    agent.events.push({
      ts:    new Date().toISOString(),
      event: eventName,
      delta,
      before,
      after:  agent.score,
      detail,
    });

    // Auto-quarantine when score drops below threshold
    const threshold = this._data._meta.policy.quarantine_threshold;
    if (agent.score < threshold && !agent.quarantined) {
      agent.quarantined    = true;
      agent.quarantinedAt  = new Date().toISOString();
      agent.quarantinedBy  = `trust-ledger:${eventName}`;

      // Propagate to live router if connected
      if (this.router?.quarantine) {
        this.router.quarantine(agentId, `TRUST_LEDGER_THRESHOLD:score=${agent.score}`);
      }

      console.error(
        `[TrustLedger] AUTO-QUARANTINE ${agentId} — score ${agent.score} < ${threshold} (event: ${eventName})`
      );
    }

    this._save();
    return { agentId, event: eventName, delta, score: agent.score, quarantined: agent.quarantined };
  }

  /** Shorthand: reward for a clean smoke test. */
  smokeTestPass(agentId) {
    return this.event(agentId, 'SMOKE_TEST_PASS');
  }

  /** Shorthand: penalize for mild AST warning. */
  astWarn(agentId, detail = '') {
    return this.event(agentId, 'AST_WARN', detail);
  }

  /** Release from quarantine, restore score by MANUAL_RESTORE delta. */
  release(agentId, authorizedBy = 'sovereign') {
    const agent = this._getOrCreate(agentId);
    if (!agent.quarantined) return null;

    const before = agent.score;
    const delta  = this._data._meta.policy.events.MANUAL_RESTORE;
    agent.score  = Math.min(this._data._meta.policy.max_score, agent.score + delta);
    agent.quarantined    = false;
    agent.releasedAt     = new Date().toISOString();
    agent.releasedBy     = authorizedBy;

    agent.events.push({
      ts:    new Date().toISOString(),
      event: 'QUARANTINE_RELEASE',
      delta,
      before,
      after:  agent.score,
      detail: `released by ${authorizedBy}`,
    });

    if (this.router?.release) {
      this.router.release(agentId);
    }

    this._save();
    return { agentId, score: agent.score, quarantined: false };
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────

  status() {
    const agents    = this.all();
    const active    = agents.filter(a => !a.quarantined);
    const quarantined = agents.filter(a => a.quarantined);
    const lowTrust  = agents
      .filter(a => a.score < 80)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    return {
      total:       agents.length,
      active:      active.length,
      quarantined: quarantined.length,
      avgScore:    agents.length
        ? Math.round(agents.reduce((s, a) => s + a.score, 0) / agents.length)
        : 0,
      lowTrust,
    };
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  _getOrCreate(agentId) {
    if (!this._data.agents[agentId]) {
      this.register(agentId);
    }
    return this._data.agents[agentId];
  }
}
