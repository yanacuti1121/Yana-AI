#!/usr/bin/env node
/**
 * YAMTAM MCP Server — exposes facts, gates, and hooks as MCP tools.
 * Any MCP-compatible agent (Claude, Cursor, etc.) can call these directly.
 *
 * Protocol: Model Context Protocol (MCP) stdio transport
 * Start: node core/mcp/yamtam-mcp-server.js
 * Or via Claude Code settings.json mcpServers entry.
 *
 * Exposed tools:
 *   yamtam_facts_search    — search L1 atomic facts by keyword
 *   yamtam_facts_add       — add a new L1 fact
 *   yamtam_gate_check      — check if an action passes the gate stack
 *   yamtam_risk_score      — get risk score for a proposed action
 *   yamtam_session_status  — current session state (trust, circuit, budget)
 *   yamtam_checkpoint      — create a session checkpoint
 */

const readline = require('readline');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const L1_DIR = path.join(PROJECT_ROOT, 'memory', 'L1_atomic');
const L2_DIR = path.join(PROJECT_ROOT, 'core', 'memory', 'L2_session');
const SCRIPTS = path.join(PROJECT_ROOT, 'core', 'scripts');

// ── MCP protocol helpers ───────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function makeResult(content, isError = false) {
  return { content: [{ type: 'text', text: content }], isError };
}

// ── Tool implementations ───────────────────────────────────────────────────────

function factsSearch({ keyword = '', tag = '' }) {
  if (!fs.existsSync(L1_DIR)) return makeResult('L1 memory directory not found.', true);

  const files = fs.readdirSync(L1_DIR).filter(f => f.endsWith('.md') && !['INDEX.md', 'SCHEMA.md'].includes(f));
  const results = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(L1_DIR, file), 'utf8');
    const kwMatch = !keyword || content.toLowerCase().includes(keyword.toLowerCase());
    const tagMatch = !tag || content.includes(tag);
    if (kwMatch && tagMatch) {
      const stmtLine = content.match(/^statement:\s*(.+)$/m);
      const stmt = stmtLine ? stmtLine[1].replace(/^["']|["']$/g, '') : '(no statement)';
      results.push(`[${file.replace('.md', '')}] ${stmt}`);
    }
  }

  if (results.length === 0) return makeResult(`No facts found matching keyword="${keyword}" tag="${tag}"`);
  return makeResult(`Found ${results.length} fact(s):\n${results.join('\n')}`);
}

function factsAdd({ id, type = 'fact', statement, confidence = 'unverified', scope = 'YAMTAM', tags = [] }) {
  if (!id || !statement) return makeResult('id and statement are required.', true);

  const safeId = id.replace(/[^a-z0-9-]/g, '-');
  const filePath = path.join(L1_DIR, `${safeId}.md`);

  if (fs.existsSync(filePath)) return makeResult(`Fact already exists: ${safeId}`, true);

  const now = new Date().toISOString().split('T')[0];
  const tagsStr = tags.length ? `[${tags.join(', ')}]` : '[]';

  const content = `---
id: ${safeId}
type: ${type}
statement: ${statement}
source: mcp:yamtam-mcp-server:${now}
confidence: ${confidence}
scope: ${scope}
tags: ${tagsStr}
---

${statement}
`;

  fs.mkdirSync(L1_DIR, { recursive: true });
  fs.writeFileSync(filePath, content);
  return makeResult(`✓ Fact added: ${safeId}\n  Statement: ${statement}`);
}

function gateCheck({ command, tool = 'Bash' }) {
  if (!command) return makeResult('command is required.', true);

  const safeRunPath = path.join(PROJECT_ROOT, 'core', 'scripts', 'safe-run.sh');
  if (!fs.existsSync(safeRunPath)) return makeResult('safe-run.sh not found.', true);

  const result = spawnSync('bash', [safeRunPath, '--engine', 'claude', ...command.split(' ')], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, YAMTAM_SAFE_RUN_DRY_RUN: '1' }
  });

  const blocked = result.status !== 0;
  const output = (result.stdout + result.stderr).trim();
  return makeResult(`Gate result: ${blocked ? 'BLOCKED' : 'ALLOWED'}\n${output || '(no output)'}`);
}

function sessionStatus() {
  const parts = [];

  // Circuit breaker
  const circuitFile = path.join(L2_DIR, 'circuit-state.json');
  if (fs.existsSync(circuitFile)) {
    try {
      const c = JSON.parse(fs.readFileSync(circuitFile, 'utf8'));
      const circuits = c.circuits || {};
      const openCircuits = Object.entries(circuits).filter(([, v]) => v.state === 'open');
      if (openCircuits.length > 0) {
        parts.push(`Circuit Breaker: OPEN (${openCircuits.map(([k]) => k).join(', ')})`);
      } else {
        parts.push('Circuit Breaker: CLOSED');
      }
    } catch { parts.push('Circuit Breaker: unknown'); }
  } else {
    parts.push('Circuit Breaker: CLOSED (no state)');
  }

  // Token budget
  const budgetFile = path.join(L2_DIR, 'token-budget.json');
  if (fs.existsSync(budgetFile)) {
    try {
      const b = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
      const tokens = b.total_tokens_used || 0;
      const fastTier = b.fast_tier_triggered ? ' [fast-tier active]' : '';
      parts.push(`Token budget: ${tokens.toLocaleString()} used${fastTier}`);
    } catch { parts.push('Token budget: unreadable'); }
  } else {
    parts.push('Token budget: no data');
  }

  // Risk log (last 3)
  const riskLog = path.join(L2_DIR, 'risk-log.jsonl');
  if (fs.existsSync(riskLog)) {
    const lines = fs.readFileSync(riskLog, 'utf8').trim().split('\n').filter(Boolean).slice(-3);
    if (lines.length > 0) {
      parts.push('Recent risk scores:');
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          parts.push(`  ${e.tool} score=${e.score} (${e.level}) — ${e.reasons}`);
        } catch { /* skip */ }
      }
    }
  }

  // Agent registry
  const registry = path.join(L2_DIR, 'agent-registry.json');
  if (fs.existsSync(registry)) {
    try {
      const r = JSON.parse(fs.readFileSync(registry, 'utf8'));
      const agents = Object.keys(r.agents || {});
      if (agents.length > 0) parts.push(`Active agents: ${agents.join(', ')}`);
    } catch { /* skip */ }
  }

  return makeResult(parts.join('\n') || 'No session data available.');
}

function sessionCheckpoint({ label = '' }) {
  const scriptPath = path.join(SCRIPTS, 'session-checkpoint.sh');
  if (!fs.existsSync(scriptPath)) return makeResult('session-checkpoint.sh not found.', true);

  const args = ['bash', scriptPath];
  if (label) args.push('--label', label);

  const result = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 10000 });
  return makeResult((result.stdout + result.stderr).trim() || 'Checkpoint created.');
}

// ── MCP server loop ────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'yamtam_facts_search', description: 'Search L1 atomic memory facts by keyword and/or tag.',
    inputSchema: { type: 'object', properties: {
      keyword: { type: 'string', description: 'Keyword to search in fact content' },
      tag: { type: 'string', description: 'Tag to filter by' }
    }}},
  { name: 'yamtam_facts_add', description: 'Add a new L1 atomic fact to YAMTAM memory.',
    inputSchema: { type: 'object', required: ['id', 'statement'], properties: {
      id: { type: 'string' }, statement: { type: 'string' },
      type: { type: 'string', enum: ['fact', 'decision', 'constraint', 'assumption', 'observation'] },
      confidence: { type: 'string', enum: ['unverified', 'low', 'medium', 'high'] },
      scope: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }
    }}},
  { name: 'yamtam_gate_check', description: 'Check if a command passes the YAMTAM safe-run gate.',
    inputSchema: { type: 'object', required: ['command'], properties: {
      command: { type: 'string', description: 'Shell command to validate' }
    }}},
  { name: 'yamtam_session_status', description: 'Get current YAMTAM session status: circuit breaker, token budget, risk log, active agents.',
    inputSchema: { type: 'object', properties: {} }},
  { name: 'yamtam_checkpoint', description: 'Create a session checkpoint (git state + L2 facts snapshot).',
    inputSchema: { type: 'object', properties: {
      label: { type: 'string', description: 'Optional label for this checkpoint' }
    }}},
];

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }

  const { id, method, params } = req;

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'yamtam-engine', version: '1.6.0' }
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};
    let result;
    try {
      switch (name) {
        case 'yamtam_facts_search':  result = factsSearch(args); break;
        case 'yamtam_facts_add':     result = factsAdd(args); break;
        case 'yamtam_gate_check':    result = gateCheck(args); break;
        case 'yamtam_session_status': result = sessionStatus(); break;
        case 'yamtam_checkpoint':    result = sessionCheckpoint(args); break;
        default: result = makeResult(`Unknown tool: ${name}`, true);
      }
    } catch (e) {
      result = makeResult(`Error: ${e.message}`, true);
    }
    send({ jsonrpc: '2.0', id, result });
  } else if (method === 'notifications/initialized') {
    // no-op
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
});
