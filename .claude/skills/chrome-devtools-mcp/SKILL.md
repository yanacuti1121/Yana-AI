---
name: chrome-devtools-mcp
description: Chrome DevTools MCP server — agent-controlled browser via MCP. take_snapshot (accessibility tree + uids), click/fill/navigate automation, screenshot, evaluate_script, console/network inspection. 41k+ stars. Sources: ChromeDevTools/chrome-devtools-mcp (Apache-2.0).
origin: yamtam-engine — synthesized from ChromeDevTools/chrome-devtools-mcp (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.55
---

# /chrome-devtools-mcp

## When to Use

- AI agent needs to control a live Chrome browser (click, fill forms, navigate)
- Debugging a web page: console errors, network requests, accessibility tree
- Performance analysis: LCP traces, Lighthouse audits (use [[chrome-devtools-lcp-debug]])
- Memory leak investigation (use [[chrome-devtools-memory-leak]])

## Do NOT use for

- Headless scraping at scale (use Playwright/Puppeteer directly)
- `--slim` mode sessions (reduced tool set — see slim-tool-reference)
- Firefox or Safari (only Chrome / Chrome for Testing officially supported)

---

## MCP config

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

```json
// Slim mode (basic automation only, lower token cost)
{ "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--headless"] }
```

---

## Core workflow pattern

```
1. navigate_page  → go to URL
2. wait_for       → wait for selector/network-idle if needed
3. take_snapshot  → get accessibility tree with element uids
4. click/fill     → interact using uid from snapshot
5. take_snapshot  → verify updated state (only when needed)
```

```typescript
// Step-by-step example (via MCP tool calls)
// 1. Navigate
await mcp.call("navigate_page", { url: "https://example.com/login" });

// 2. Snapshot → get uids
const snapshot = await mcp.call("take_snapshot", {});
// snapshot contains: { elements: [{ uid: "a1b2", role: "textbox", name: "Email" }, ...] }

// 3. Fill form in ONE call (preferred over multiple fill calls)
await mcp.call("fill_form", {
  elements: [
    { uid: "a1b2", value: "user@example.com" },   // Email field
    { uid: "c3d4", value: "password123" },          // Password field
    { uid: "e5f6", value: "true" },                 // Remember me checkbox
  ]
});

// 4. Click submit
await mcp.call("click", { uid: "g7h8" });

// 5. Wait for navigation
await mcp.call("wait_for", { selector: "[data-testid='dashboard']" });
```

---

## Tool selection guide

```
Goal                          Tool
────────────────────────────  ─────────────────────────────────────────────
Understand page structure     take_snapshot (accessibility tree, faster)
See visual state              take_screenshot (when human needs to see)
Get extra data                evaluate_script (data not in accessibility tree)
Fill multiple form fields     fill_form (one call > multiple fill calls)
Check errors                  list_console_messages (types: ["error"])
Check network                 list_network_requests / get_network_request
Run Lighthouse audit          lighthouse_audit
```

---

## Efficient data retrieval patterns

```typescript
// Large outputs → use filePath to avoid polluting context
await mcp.call("take_screenshot",  { filePath: "/tmp/screenshot.png" });
await mcp.call("take_snapshot",    { filePath: "/tmp/snapshot.json" });

// Console: filter by type + pagination
await mcp.call("list_console_messages", {
  types: ["error", "warning"],
  pageSize: 20,
  pageIdx: 0,
  includePreservedMessages: true,   // catch load-time issues
});

// Network: filter to API calls only
await mcp.call("list_network_requests", {
  urlFilter: "/api/",
  pageSize: 10,
});

// evaluate_script: extract structured data not in accessibility tree
await mcp.call("evaluate_script", {
  script: "JSON.stringify(window.__APP_STATE__)"
});
```

---

## Parallel tool calls

```
Rules:
  1. navigate → wait → snapshot → interact (must be sequential — each depends on prior)
  2. Independent reads can run in parallel:
     [list_console_messages, list_network_requests] — parallel OK
     [take_screenshot, evaluate_script]             — parallel OK
  3. NEVER parallelize writes (click, fill) — order matters
```

---

## Extension testing workflow

```typescript
// 1. Install unpacked extension
const { extensionId } = await mcp.call("install_extension", {
  path: "/path/to/extension"
});

// 2. Trigger popup / side panel
await mcp.call("trigger_extension_action", { extensionId });

// 3. Verify service worker state
await mcp.call("evaluate_script", {
  serviceWorkerId: extensionId,
  script: "self.registration.scope"
});

// 4. Navigate and verify content script effect
await mcp.call("navigate_page", { url: "https://example.com" });
const snapshot = await mcp.call("take_snapshot", {});
// Check snapshot for injected elements
```

---

## Anti-Fake-Pass Checklist

```
❌ Taking a screenshot when take_snapshot suffices → screenshot costs more tokens; use for visual-only needs
❌ Multiple fill calls instead of fill_form → 3-5x more tool calls for the same form
❌ Reading snapshot after every action → only re-snapshot when you need the updated state
❌ Not using filePath for large outputs → raw screenshot/trace data floods context
❌ Assuming Chrome is already open → browser starts automatically on first tool call; no pre-launch needed
❌ Using slim mode without knowing its limitations → slim mode lacks performance/memory/extension tools
```
