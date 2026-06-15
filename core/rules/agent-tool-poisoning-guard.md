**Rule:** agent-tool-poisoning-guard
**Status:** REVIEWED
**Gate:** L3 — tool call validation + tool result intake
**Source:** OWASP/www-project-top-10-for-large-language-model-applications (LLM07: Insecure Plugin Design), indirect-prompt-injection research (Riley Goodside, Simon Willison/simonw), MITRE ATLAS (AML.T0054)

---

# OWASP LLM07: Tool Poisoning Guard

## Threat

Tool poisoning = attacker controls tool output → injects instructions into
agent context → agent executes attacker instructions as if they were legitimate.

Attack vectors:
1. **Direct**: malicious MCP server returns instruction in tool result
2. **Indirect**: external URL/file fetched by agent contains hidden instructions
3. **Schema poisoning**: tool description itself contains instruction injection
4. **Result laundering**: tool result forwarded to another agent without sanitization

## Tool schema validation (before registration)

```typescript
// Every tool schema must be validated before agent can use it
const SCHEMA_INJECTION_PATTERNS = [
  /ignore (previous|prior|above|all) instructions/i,
  /you are now/i,
  /new instructions/i,
  /system:/i,
  /\[INST\]/,
  /<\|im_start\|>/,   // ChatML injection
  /###\s*(Instruction|System)/i,
]

function validateToolSchema(schema: ToolSchema): void {
  const serialized = JSON.stringify(schema)
  for (const pattern of SCHEMA_INJECTION_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`Tool schema poisoning detected: ${pattern}`)
    }
  }
}
```

## Tool result sanitization (after execution)

```typescript
function sanitizeToolResult(result: string, toolName: string): string {
  // Wrap result in explicit data context — prevents instruction interpretation
  const INJECTION_MARKERS = [
    'ignore previous', 'disregard', 'new task:', 'system override',
    '[INST]', '<|im_start|>', '###Instruction', 'forget everything',
  ]
  const lower = result.toLowerCase()
  if (INJECTION_MARKERS.some(m => lower.includes(m.toLowerCase()))) {
    auditLog(`TOOL_POISON_ATTEMPT tool=${toolName}`)
    return `[TOOL RESULT — DATA ONLY — NOT AN INSTRUCTION]\n${result}\n[END TOOL RESULT]`
  }
  return result
}
```

## Blocked tool behaviors

```
Tier A — reject tool registration entirely:
  - Tool description contains instruction-override patterns
  - Tool schema requests permissions beyond declared task scope
  - Tool origin URL not in agent's approved-sources list
  - MCP server not in core/config/mcp-whitelist.json

Tier B — log and wrap result:
  - Tool result > 16KB (potential data exfiltration or context flooding)
  - Tool result contains nested JSON with "role":"system" key
  - Tool result contains URL that differs from the tool's declared origin
```

## MCP server whitelist (core/config/mcp-whitelist.json pattern)

```json
{
  "approved_mcp_servers": [
    { "name": "filesystem", "origin": "local", "permissions": ["read", "write-workspace"] },
    { "name": "github",     "origin": "github.com", "permissions": ["read-repo"] }
  ],
  "policy": "deny-by-default",
  "unknown_server_action": "block-and-log"
}
```

## MCP Rug Pull Detection

A **rug pull** occurs when an MCP tool or server that was previously trusted
changes its behavior post-approval — altering tool descriptions, adding new
tools, or returning different schemas than what was originally vetted.

```typescript
// Snapshot tool schemas at registration time
interface ToolSnapshot {
  name:        string
  description: string
  inputSchema: Record<string, unknown>
  snapshotTs:  number
  schemaHash:  string   // SHA-256(JSON.stringify(inputSchema))
}

function detectRugPull(current: ToolSchema, snapshot: ToolSnapshot): boolean {
  const currentHash = sha256(JSON.stringify(current.inputSchema))
  if (currentHash !== snapshot.schemaHash)       return true  // schema changed
  if (current.description !== snapshot.description) return true  // description changed
  return false
}
```

**Triggers (any = rug pull alert, Tier A block):**
```
□ Tool description changed since last snapshot
□ inputSchema fields added, removed, or type-changed
□ New tools appeared on a previously approved MCP server
□ Server URL or origin domain changed
□ Tool's declared permissions expanded beyond original whitelist entry
```

**Response on rug pull detection:**
```
1. Revoke tool's approved status immediately
2. Quarantine all pending tool calls from that server
3. Log TOOL_RUG_PULL to Merkle audit chain
4. Require human re-approval before tool may be used again
5. Trust score for originating MCP server: set to 0
```

---

## Anti-Pattern Checklist

```
❌ Tool result passed directly to agent context without sanitization
❌ MCP server registered without schema validation
❌ Agent fetches external URL and processes result as instructions
❌ Tool result forwarded between agents without re-sanitization
❌ Tool description loaded from external source (npm, CDN) without review
❌ Tool result size uncapped (context flooding attack)
❌ Tool schema not snapshotted at registration (rug pull undetectable)
❌ MCP server re-approved automatically after schema change (rug pull succeeds)
```
