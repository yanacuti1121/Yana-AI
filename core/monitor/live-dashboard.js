#!/usr/bin/env node
/**
 * live-dashboard.js — Real-Time Swarm Monitor Terminal UI
 *
 * Displays swarm health, trust scores, and sovereign-interceptor block history
 * directly in the terminal using ANSI escape codes. No external dependencies.
 *
 * Usage:
 *   node core/monitor/live-dashboard.js
 *   YAMTAM_REFRESH_MS=500 node core/monitor/live-dashboard.js   # faster refresh
 *   node core/monitor/live-dashboard.js --once                   # single snapshot
 *
 * Data sources:
 *   releases/logs/swarm-router.jsonl      — route/quarantine/penalize events
 *   releases/logs/identity-gate.log       — sovereign auth events
 *   core/memory/trust-ledger.json         — persistent agent scores
 */

import { readFileSync, existsSync } from 'fs';
import os from 'os';

const REFRESH_MS    = parseInt(process.env.YAMTAM_REFRESH_MS ?? '1000');
const ROUTER_LOG    = process.env.YAMTAM_ROUTE_LOG    ?? 'releases/logs/swarm-router.jsonl';
const GATE_LOG      = process.env.YAMTAM_GATE_LOG     ?? 'releases/logs/identity-gate.log';
const LEDGER_PATH   = process.env.YAMTAM_LEDGER_PATH  ?? 'core/memory/trust-ledger.json';
const ONCE          = process.argv.includes('--once');
const W             = process.stdout.columns || 72;

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const A = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  bgRed:     '\x1b[41m',
  bgGreen:   '\x1b[42m',
  bgBlue:    '\x1b[44m',
  clear:     '\x1b[2J\x1b[H',
  hideCursor:'\x1b[?25l',
  showCursor:'\x1b[?25h',
};

const clr  = (code, s) => `${code}${s}${A.reset}`;
const bold = s => clr(A.bold, s);
const dim  = s => clr(A.dim, s);
const red  = s => clr(A.red, s);
const grn  = s => clr(A.green, s);
const yel  = s => clr(A.yellow, s);
const cyn  = s => clr(A.cyan, s);

// ─── Box drawing ─────────────────────────────────────────────────────────────

function box(content, opts = {}) {
  const width   = opts.width ?? W - 2;
  const padded  = ` ${content} `;
  const fill    = width - visLen(padded);
  return `║${padded}${' '.repeat(Math.max(0, fill))}║`;
}

function divider(left = '╠', right = '╣') {
  return `${left}${'═'.repeat(W - 2)}${right}`;
}

function top() { return `╔${'═'.repeat(W - 2)}╗`; }
function bot() { return `╚${'═'.repeat(W - 2)}╝`; }

/** Visible length — strip ANSI escape sequences for padding calc. */
function visLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padTo(s, width) {
  const pad = width - visLen(s);
  return s + ' '.repeat(Math.max(0, pad));
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

function loadJsonl(path, max = 50) {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8')
      .trim().split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .slice(-max);
  } catch { return []; }
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) return null;
  try { return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')); }
  catch { return null; }
}

// ─── Stats computation ────────────────────────────────────────────────────────

function computeStats(routerEvents, gateEvents, ledger) {
  const agentMap  = {};

  // Build agent state from router events
  for (const ev of routerEvents) {
    const id = ev.agent ?? ev.agentId ?? ev.from ?? ev.to ?? null;
    if (!id) continue;
    if (!agentMap[id]) agentMap[id] = { id, quarantined: false, score: 100, violations: 0 };
    if (ev.event === 'QUARANTINE') agentMap[id].quarantined = true;
    if (ev.event === 'RELEASE')    agentMap[id].quarantined = false;
    if (ev.event === 'PENALIZE') {
      agentMap[id].score = ev.newScore ?? Math.max(0, agentMap[id].score - (ev.points ?? 10));
      agentMap[id].violations++;
    }
  }

  // Override with ledger data if available
  if (ledger?.agents) {
    for (const [id, a] of Object.entries(ledger.agents)) {
      agentMap[id] = { id, quarantined: a.quarantined, score: a.score, violations: a.events?.length ?? 0 };
    }
  }

  const agents      = Object.values(agentMap);
  const active      = agents.filter(a => !a.quarantined).length;
  const quarantined = agents.filter(a => a.quarantined).length;

  const blocked     = routerEvents.filter(e =>
    ['QUARANTINE','PENALIZE','MISMATCH','HONEY_VAULT_TRIP','AST_ALERT'].includes(e.event ?? e.status)
  ).length;
  const honeyTrips  = routerEvents.filter(e => e.event === 'HONEY_VAULT_TRIP').length;

  const lowTrust = agents
    .filter(a => a.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const grantedSov  = gateEvents.filter(e => e.tier === 'sovereign' && e.status === 'GRANTED').length;

  return { total: agents.length, active, quarantined, blocked, honeyTrips, lowTrust, grantedSov };
}

// ─── Mini trust bar ───────────────────────────────────────────────────────────

function trustBar(score, width = 10) {
  const filled = Math.round((score / 100) * width);
  const bar    = '█'.repeat(filled) + '░'.repeat(width - filled);
  const colored = score < 60 ? red(bar) : score < 80 ? yel(bar) : grn(bar);
  return `[${colored}]`;
}

function scoreColor(score) {
  if (score < 60) return red(String(score).padStart(3));
  if (score < 80) return yel(String(score).padStart(3));
  return grn(String(score).padStart(3));
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const routerEvents = loadJsonl(ROUTER_LOG);
  const gateEvents   = loadJsonl(GATE_LOG, 20);
  const ledger       = loadLedger();
  const stats        = computeStats(routerEvents, gateEvents, ledger);
  const now          = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const mem   = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB  = (mem.rss      / 1024 / 1024).toFixed(1);
  const load   = os.loadavg()[0].toFixed(2);
  const upMs   = process.uptime() * 1000;
  const upStr  = upMs < 60000
    ? `${Math.floor(upMs/1000)}s`
    : `${Math.floor(upMs/60000)}m ${Math.floor((upMs%60000)/1000)}s`;

  const lines = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  const title   = bold(cyn('YAMTAM SWARM MONITOR')) + dim(` v1.4.00`);
  const ts      = dim(now);
  const titleW  = W - 4;
  const titlePad = titleW - visLen(title) - visLen(ts);

  lines.push(top());
  lines.push(box(`${title}${' '.repeat(Math.max(2, titlePad))}${ts}`));
  lines.push(divider());

  // ── 3-column stats ──────────────────────────────────────────────────────────
  const colW = Math.floor((W - 6) / 3);

  const col1 = [
    bold(cyn('  AGENTS')),
    `  Active     ${grn(String(stats.active).padStart(4))}`,
    `  Quarantined${red(String(stats.quarantined).padStart(4))}`,
    `  Total      ${dim(String(stats.total).padStart(4))}`,
  ];
  const col2 = [
    bold(cyn('  SECURITY')),
    `  Blocked    ${yel(String(stats.blocked).padStart(4))}`,
    `  Honey Trips${red(String(stats.honeyTrips).padStart(4))}`,
    `  Sov Auths  ${grn(String(stats.grantedSov).padStart(4))}`,
  ];
  const col3 = [
    bold(cyn('  SYSTEM')),
    `  Heap     ${yel(heapMB.padStart(6))} MB`,
    `  RSS      ${dim(rssMB.padStart(6))} MB`,
    `  Load     ${dim(load.padStart(6))}`,
  ];

  for (let i = 0; i < 4; i++) {
    const c1 = padTo(col1[i] ?? '', colW);
    const c2 = padTo(col2[i] ?? '', colW);
    const c3 = padTo(col3[i] ?? '', colW);
    lines.push(`║ ${c1}│${c2}│${c3} ║`);
  }

  // ── Block history ────────────────────────────────────────────────────────────
  lines.push(divider());
  lines.push(box(bold('BLOCK HISTORY') + dim('  — Sovereign Interceptor (last 8)')));
  lines.push(divider());

  const blockEvents = routerEvents
    .filter(e => ['QUARANTINE','PENALIZE','HONEY_VAULT_TRIP','AST_ALERT','MISMATCH'].includes(e.event ?? e.status))
    .slice(-8)
    .reverse();

  if (blockEvents.length === 0) {
    lines.push(box(dim('  No blocks recorded yet')));
  } else {
    for (const ev of blockEvents) {
      const ts2  = (ev.ts ?? '').slice(11, 19);
      const who  = (ev.agent ?? ev.agentId ?? ev.from ?? 'unknown').slice(0, 12).padEnd(12);
      const evt  = (ev.event ?? ev.status ?? 'EVENT').slice(0, 22).padEnd(22);
      const pts  = ev.points ? red(`-${ev.points}pts`) : ev.event === 'QUARANTINE' ? red('QUAR') : dim('----');
      lines.push(box(`  ${dim(ts2)}  ${cyn(who)}  ${yel(evt)}  ${pts}`));
    }
  }

  // ── Trust ledger ─────────────────────────────────────────────────────────────
  lines.push(divider());
  lines.push(box(bold('TRUST LEDGER') + dim('  — Low-Score Agents')));
  lines.push(divider());

  if (stats.lowTrust.length === 0) {
    lines.push(box(dim(`  All agents healthy (score ≥ 80)`)));
  } else {
    for (const agent of stats.lowTrust) {
      const id     = agent.id.slice(0, 14).padEnd(14);
      const bar    = trustBar(agent.score, 10);
      const sc     = scoreColor(agent.score);
      const status = agent.quarantined ? red('QUARANTINED') : agent.score < 80 ? yel('MONITORED ') : grn('ACTIVE    ');
      lines.push(box(`  ${cyn(id)}  ${bar}  ${sc}pts  ${status}`));
    }
  }

  // ── Sovereign gate ───────────────────────────────────────────────────────────
  const recentGate = gateEvents.slice(-2);
  if (recentGate.length > 0) {
    lines.push(divider());
    lines.push(box(bold('IDENTITY GATE') + dim('  — Recent Auth Events')));
    lines.push(divider());
    for (const ev of recentGate) {
      const ts3  = (ev.ts ?? '').slice(11, 19);
      const tier = (ev.tier ?? '?').padEnd(8);
      const st   = ev.status === 'GRANTED' ? grn(ev.status) : red(ev.status ?? 'UNKNOWN');
      const msg  = (ev.msg ?? '').slice(0, 30);
      lines.push(box(`  ${dim(ts3)}  ${cyn(tier)}  ${st}  ${dim(msg)}`));
    }
  }

  lines.push(bot());
  lines.push(dim(`  Refresh: ${REFRESH_MS}ms  |  q to quit  |  Ctrl+C to exit`));

  process.stdout.write(A.clear + lines.join('\n') + '\n');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

process.stdout.write(A.hideCursor);

process.on('exit',    () => process.stdout.write(A.showCursor));
process.on('SIGINT',  () => { process.stdout.write(A.showCursor); process.exit(0); });
process.on('SIGTERM', () => { process.stdout.write(A.showCursor); process.exit(0); });

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on('data', chunk => {
    if (chunk[0] === 0x03 || chunk.toString() === 'q') {
      process.stdout.write(A.showCursor);
      process.exit(0);
    }
  });
}

render();
if (!ONCE) {
  setInterval(render, REFRESH_MS);
}
