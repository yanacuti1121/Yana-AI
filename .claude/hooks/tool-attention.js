#!/usr/bin/env node
// PostToolUse hook — Tool Attention tracker.
// Inspired by "Tool Attention Is All You Need" (Sadani & Kumar, 2026).
//
// Problem: MCP/Tools Tax — every turn loads 10k–60k tokens of tool schemas
// even when most tools aren't used. Causes attention dilution and reasoning
// degradation past 70% context utilization.
//
// What this hook does:
//   1. Logs every tool invocation per session
//   2. After 20 tool calls, computes utilization ratio per MCP server
//   3. Warns if any server has 0 calls (dead weight in context)
//   4. Suggests moving rarely-used servers to on-demand tier
//
// Fails open. Advisory only — never blocks tool calls.

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPORT_AFTER_CALLS = 20;       // emit utilization report every N calls
const DEAD_TOOL_THRESHOLD = 0;       // tool used 0 times = dead weight
const REPORT_DEBOUNCE_CALLS = 50;    // don't repeat report within N calls

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    const toolName = data.tool_name;
    if (!sessionId || !toolName) process.exit(0);
    if (/[/\\]|\.\./.test(sessionId)) process.exit(0);

    const stateFile = path.join(os.tmpdir(), `claude-tool-attn-${sessionId}.json`);
    let state = { counts: {}, totalCalls: 0, lastReportAt: 0 };
    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
    }

    // Increment counter for this tool
    state.counts[toolName] = (state.counts[toolName] || 0) + 1;
    state.totalCalls += 1;
    fs.writeFileSync(stateFile, JSON.stringify(state));

    // Report at threshold, with debounce
    if (state.totalCalls < REPORT_AFTER_CALLS) process.exit(0);
    if (state.totalCalls - state.lastReportAt < REPORT_DEBOUNCE_CALLS) process.exit(0);

    // Detect MCP-prefixed tools (mcp__servername__toolname)
    const mcpServerCalls = {};
    for (const [tool, count] of Object.entries(state.counts)) {
      const match = tool.match(/^mcp__([^_]+(?:_[^_]+)*?)__/);
      if (match) {
        const server = match[1];
        mcpServerCalls[server] = (mcpServerCalls[server] || 0) + count;
      }
    }

    // Only report if there's a meaningful pattern
    const servers = Object.keys(mcpServerCalls);
    if (servers.length === 0) process.exit(0);

    const sorted = servers.sort((a, b) => mcpServerCalls[b] - mcpServerCalls[a]);
    const utilization = sorted.map(s => `${s}: ${mcpServerCalls[s]}`).join(', ');

    state.lastReportAt = state.totalCalls;
    fs.writeFileSync(stateFile, JSON.stringify(state));

    const message = `📊 Tool Attention check (${state.totalCalls} tool calls so far). MCP server utilization: ${utilization}. If a server has very low usage (< 2 calls per 50 tool uses), it may be paying MCP Tax without value — consider moving to on-demand tier in .claude/mcp-tier.json or removing from .mcp.json. See "Tool Attention Is All You Need" (arXiv 2604.21816) for the underlying problem.`;

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message
      }
    }));
  } catch {
    process.exit(0);
  }
});
