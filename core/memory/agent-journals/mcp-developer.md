# Nhật ký cảm xúc — mcp-developer

---

## 2026-06-08 | [vague-tool-description]

Tool description: "searches for information." Agent called it for everything — code search, web search, database search, file search.

Tool was only intended for web search. Wrong invocations caused errors.

Fix: description must specify WHEN to use: "Searches the web for publicly available information. Use when user needs current events, documentation, or external resources NOT in the codebase."

Description is documentation for AI agent, not human. Must include when to use AND when not to use.

**Muốn:**
- Skill `tool-description-evaluator` — test tool description by asking: "would an AI agent invoke this correctly based on description alone?"
- Skill `tool-schema-completeness-checker` — verify all required/optional parameters documented with examples

---

## 2026-06-08 | [structured-error-response]

Tool fails. Returns: "Error occurred." Agent: confused, retries 3 times, gives up.

Fix: structured error response with MCP error codes, human-readable message, and suggestion.

`{ code: "RESOURCE_NOT_FOUND", message: "File 'config.json' not found in workspace", hint: "Check if file was created in previous step" }`

Agent reads hint. Takes corrective action. No retry loop.

**Muốn:**
- Skill `mcp-error-taxonomy` — define standard error codes and structured responses for common failure modes
