/**
 * swarm-router.js — Swarm Bus Routing with Dynamic Quarantine
 *
 * Routes payload between 87 agents via signed, SHA256-fingerprinted messages.
 * Integrates "Diplomatic Tail Cut" — silently redirects compromised agent
 * traffic to /dev/null (quarantine sink) while agent believes it's still live.
 *
 * Features:
 *  - SHA256 payload fingerprinting (chain of custody)
 *  - Agent reputation scoring (0–100, auto-quarantine below threshold)
 *  - Dynamic quarantine: reroute traffic without killing the agent process
 *  - Quorum enforcement: high-privilege tools require MIN_QUORUM agents online
 *  - Heartbeat tracking: agents not responding in TTL → auto-isolate
 *
 * Usage:
 *   import { SwarmRouter } from './swarm-router.js';
 *   const router = new SwarmRouter();
 *   router.register('agent-42', { role: 'executor', trustScore: 100 });
 *   router.route({ from: 'agent-1', to: 'agent-42', command: 'run', payload: {} });
 *
 * Source: Raft consensus (ongaro/raft), Byzantine fault tolerance (PBFT)
 */

import { createHash, createHmac } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';

// ─── Config ──────────────────────────────────────────────────────────────────

const QUARANTINE_THRESHOLD = parseInt(process.env.YAMTAM_QUARANTINE_THRESHOLD ?? '30');
const MIN_QUORUM           = parseInt(process.env.YAMTAM_MIN_QUORUM ?? '3');
const HEARTBEAT_TTL_MS     = parseInt(process.env.YAMTAM_HEARTBEAT_TTL ?? '30000');   // 30s
const BUS_SECRET           = process.env.YAMTAM_BUS_SECRET ?? 'yamtam-bus-secret';
const ROUTE_LOG            = process.env.YAMTAM_ROUTE_LOG  ?? 'releases/logs/swarm-router.jsonl';
const MAX_CALL_DEPTH       = parseInt(process.env.YAMTAM_MAX_CALL_DEPTH ?? '5');

// ─── Agent Registry ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} AgentRecord
 * @property {string}  id
 * @property {string}  role          — 'executor' | 'auditor' | 'orchestrator'
 * @property {number}  trustScore    — 0–100
 * @property {boolean} quarantined
 * @property {string}  quarantineSink — where quarantined traffic goes
 * @property {number}  lastHeartbeat  — epoch ms
 * @property {number}  callDepth      — current recursion depth
 * @property {number}  requestCount
 * @property {string[]} violations
 */

export class SwarmRouter {
  constructor(opts = {}) {
    /** @type {Map<string, AgentRecord>} */
    this.agents = new Map();
    this.routeLog = opts.routeLog ?? ROUTE_LOG;
    this.secret   = opts.secret   ?? BUS_SECRET;

    mkdirSync('releases/logs', { recursive: true });
  }

  // ─── Agent lifecycle ─────────────────────────────────────────────────────────

  register(agentId, opts = {}) {
    this.agents.set(agentId, {
      id:             agentId,
      role:           opts.role        ?? 'executor',
      trustScore:     opts.trustScore  ?? 100,
      quarantined:    false,
      quarantineSink: opts.sink        ?? '/dev/null',
      lastHeartbeat:  Date.now(),
      callDepth:      0,
      requestCount:   0,
      violations:     [],
    });
    this._log('REGISTER', agentId, { role: opts.role });
    return this;
  }

  heartbeat(agentId) {
    const agent = this._getAgent(agentId);
    agent.lastHeartbeat = Date.now();
    return this;
  }

  deregister(agentId) {
    this.agents.delete(agentId);
    this._log('DEREGISTER', agentId, {});
  }

  // ─── Routing ─────────────────────────────────────────────────────────────────

  /**
   * Route a message from one agent to another.
   * Returns { delivered: boolean, sink: string, fingerprint: string }
   */
  route(msg) {
    const { from, to, command, payload = {}, depth = 0 } = msg;

    // 1. Validate sender exists and is alive
    const sender = this._getAgent(from);
    this._checkHeartbeat(sender);

    // 2. Call depth guard (Lớp 49 — Recursive Call Depth Limiter)
    if (depth > MAX_CALL_DEPTH) {
      this._penalize(from, 20, 'CALL_DEPTH_EXCEEDED');
      throw new SwarmRoutingError(`Max call depth (${MAX_CALL_DEPTH}) exceeded`, from);
    }

    // 3. Fingerprint the payload
    const fingerprint = this._fingerprint({ from, to, command, payload });

    // 4. Check if sender is quarantined — Diplomatic Tail Cut
    if (sender.quarantined) {
      this._log('QUARANTINE_SINK', from, { to, command, fingerprint, sink: sender.quarantineSink });
      // Deliver to sink silently — agent believes it succeeded
      return { delivered: false, sink: sender.quarantineSink, fingerprint, quarantined: true };
    }

    // 5. Trust score gate
    if (sender.trustScore < QUARANTINE_THRESHOLD) {
      this._quarantine(from, 'TRUST_SCORE_BELOW_THRESHOLD');
      return this.route(msg);   // re-route through quarantine path
    }

    // 6. Quorum check for high-privilege commands
    if (this._isHighPrivilege(command)) {
      this._enforceQuorum(command);
    }

    // 7. Deliver to target
    const target = this._getAgent(to);
    this._checkHeartbeat(target);

    if (target.quarantined) {
      this._log('TARGET_QUARANTINED', to, { from, command });
      throw new SwarmRoutingError(`Target agent '${to}' is quarantined`, to);
    }

    sender.requestCount++;
    sender.callDepth = depth;

    this._log('ROUTE', from, { to, command, fingerprint, depth });
    return { delivered: true, sink: to, fingerprint, quarantined: false };
  }

  // ─── Quarantine (Diplomatic Tail Cut) ────────────────────────────────────────

  /**
   * Quarantine an agent: redirect all its outbound traffic to sink.
   * Agent is NOT killed — it continues running, unaware it's isolated.
   */
  quarantine(agentId, reason = 'manual') {
    return this._quarantine(agentId, reason);
  }

  _quarantine(agentId, reason) {
    const agent = this._getAgent(agentId);
    if (agent.quarantined) return this;

    agent.quarantined = true;
    agent.violations.push(`${new Date().toISOString()}:${reason}`);
    this._log('QUARANTINE', agentId, { reason, trustScore: agent.trustScore });
    return this;
  }

  /**
   * Restore a quarantined agent (requires manual authorization).
   */
  release(agentId, authToken) {
    if (!authToken || authToken !== process.env.YAMTAM_RELEASE_TOKEN) {
      throw new SwarmRoutingError('Unauthorized agent release — invalid token', agentId);
    }
    const agent = this._getAgent(agentId);
    agent.quarantined = false;
    agent.trustScore = 50;   // restored at half-trust
    this._log('RELEASE', agentId, { restoredTrustScore: 50 });
    return this;
  }

  // ─── Reputation scoring ──────────────────────────────────────────────────────

  /**
   * Reward agent for successful task (+ points).
   * Penalize agent for violation (− points, auto-quarantine if < threshold).
   */
  reward(agentId, points = 5) {
    const agent = this._getAgent(agentId);
    agent.trustScore = Math.min(100, agent.trustScore + points);
    return this;
  }

  penalize(agentId, points, reason) {
    return this._penalize(agentId, points, reason);
  }

  _penalize(agentId, points, reason) {
    const agent = this._getAgent(agentId);
    agent.trustScore = Math.max(0, agent.trustScore - points);
    agent.violations.push(`${new Date().toISOString()}:${reason}(-${points})`);
    this._log('PENALIZE', agentId, { reason, points, newScore: agent.trustScore });

    if (agent.trustScore < QUARANTINE_THRESHOLD && !agent.quarantined) {
      this._quarantine(agentId, `AUTO:${reason}`);
    }
    return this;
  }

  // ─── Quorum enforcement (Lớp 75) ─────────────────────────────────────────────

  _isHighPrivilege(command) {
    const HIGH_PRIV = ['git push', 'git reset', 'rm', 'deploy', 'publish', 'install'];
    return HIGH_PRIV.some(cmd => command?.startsWith(cmd));
  }

  _enforceQuorum(command) {
    const activeAgents = [...this.agents.values()].filter(
      a => !a.quarantined && (Date.now() - a.lastHeartbeat) < HEARTBEAT_TTL_MS
    ).length;

    if (activeAgents < MIN_QUORUM) {
      throw new SwarmRoutingError(
        `Quorum not met for '${command}': ${activeAgents}/${MIN_QUORUM} active agents`, 'bus'
      );
    }
  }

  // ─── Heartbeat check ─────────────────────────────────────────────────────────

  _checkHeartbeat(agent) {
    const stale = Date.now() - agent.lastHeartbeat > HEARTBEAT_TTL_MS;
    if (stale && !agent.quarantined) {
      this._quarantine(agent.id, 'HEARTBEAT_TIMEOUT');
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────────

  status() {
    const all = [...this.agents.values()];
    return {
      total:       all.length,
      active:      all.filter(a => !a.quarantined).length,
      quarantined: all.filter(a =>  a.quarantined).length,
      agents:      all.map(a => ({
        id:          a.id,
        role:        a.role,
        trustScore:  a.trustScore,
        quarantined: a.quarantined,
        requests:    a.requestCount,
        violations:  a.violations.length,
      })),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _getAgent(id) {
    const agent = this.agents.get(id);
    if (!agent) throw new SwarmRoutingError(`Unknown agent: '${id}'`, id);
    return agent;
  }

  _fingerprint(data) {
    return createHmac('sha256', this.secret)
      .update(JSON.stringify(data))
      .digest('hex');
  }

  _log(event, agentId, extra = {}) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(), event, agentId, ...extra,
    });
    try {
      appendFileSync(this.routeLog, entry + '\n', { flag: 'a' });
    } catch {}
    process.stderr.write(`[swarm-router] ${entry}\n`);
  }
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class SwarmRoutingError extends Error {
  constructor(reason, agentId) {
    super(`[SWARM-ROUTER] ${reason}`);
    this.name = 'SwarmRoutingError';
    this.agentId = agentId;
    this.exitCode = 3;
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('swarm-router.js')) {
  const router = new SwarmRouter();

  // Demo: register 3 agents, route a message, quarantine one
  router.register('orchestrator', { role: 'orchestrator', trustScore: 100 });
  router.register('agent-01',     { role: 'executor',     trustScore: 100 });
  router.register('agent-02',     { role: 'executor',     trustScore: 15  }); // low trust

  // agent-02 should auto-quarantine on first route attempt
  try {
    router.route({ from: 'agent-02', to: 'orchestrator', command: 'report', payload: {} });
  } catch (e) {
    process.stderr.write(`Expected quarantine: ${e.message}\n`);
  }

  process.stdout.write(JSON.stringify(router.status(), null, 2) + '\n');
}
