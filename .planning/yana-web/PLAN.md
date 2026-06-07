# Plan — Yana Web (AI Task Orchestration Web UI)

> Goal: Deliver a standalone vanilla-JS + Node web app under `tools/yana-web/` that classifies a natural-language task via yana-router (with a JS fallback when the binary is absent), then streams a Claude API response using the user's own key, with localStorage-only history, runnable on Google Cloud Shell port 8081.
> Related: Builds on yamtam-engine `route classify` (src/route.rs) + `core/agents/*`. No PRD/ADR exists for this product.
> Estimated waves: 4 · 11 tasks

---

## Context discovered (read before executing — these are facts, not assumptions)

These were verified against the live repo. The executor MUST honor them; do not re-derive.

1. **The Rust binary is NOT built and cargo is NOT installed.** There is no `releases/bin/yamtam-rt` (the path in the feature brief is wrong) and no `target/release/yamtam-rt`. The only entry point is `node /home/user/yamtam-engine/scripts/yamtam-rt-wrapper.js route classify ...`, which itself exits with an error when no binary is found.
   → **Consequence:** the backend MUST treat the router as optional. It tries the wrapper; on any non-zero exit / spawn error it falls back to a built-in JS classifier (Task 2.1). The web app must work end-to-end with zero Rust toolchain.

2. **Exact router CLI contract** (from `src/route.rs`):
   - Invocation: `route classify "<task text>"` (task is a positional arg; omit → reads stdin). Add no other flags — default output is JSON. The `--plain` flag switches to text; do NOT pass it.
   - JSON output shape (field names exact):
     ```json
     {
       "route": "simple" | "complex" | "external",
       "gate": "auto" | "harness" | "confirm",
       "confidence": 0.0,
       "reason": "string",
       "matched_signals": ["string"],
       "suggested_agents": ["string"]
     }
     ```
   - `route` is lowercase. `confidence` is a float 0.0–1.0.

3. **Wrapper resolution honors `$YAMTAM_RT_BIN`.** The backend should spawn the wrapper with the inherited env so an operator who later builds the binary gets real routing for free.

4. **Agent files** live at `/home/user/yamtam-engine/core/agents/<name>.md` — YAML frontmatter (`name`, `description`, `model`) followed by a markdown body that IS the system prompt. `suggested_agents` from the router (e.g. `security-engineer`, `deployment-engineer`, `frontend-developer`) map to these files by `<name>.md`. Not every suggested agent name has a file; missing files must degrade gracefully to a generic system prompt.

5. **Node v20.19.1 is available. Express is NOT installed and installing it triggers the dependency-vetting gate (Tier 1 security).** → Backend MUST use only Node built-ins (`http`, `https`, `child_process`, `fs`, `path`, `url`). Zero runtime npm dependencies. `package.json` declares no `dependencies`.

6. **Port:** brief body says 8081 (8080 is taken by codexmate). Use **8081**, overridable via `process.env.PORT`.

7. **Claude API:** `POST https://api.anthropic.com/v1/messages`, headers `x-api-key: <user key>`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Streaming via `"stream": true` returns Server-Sent Events; the backend pipes these straight to the browser. The user's key is sent per-request from the browser; the backend never stores it.

8. This plan writes ONLY under `/home/user/yamtam-engine/tools/yana-web/`. No existing repo file is modified (satisfies scope-drift law & out-of-scope list).

---

## Prerequisites

- Node ≥ 18 on PATH (verified: v20.19.1). 
- No npm install required (zero deps).
- A user-supplied Anthropic API key is needed only at runtime to test the streaming path (Task 4.1). Classification and UI tasks need no key.

---

## Wave 1 — Scaffold + backend skeleton [parallel]

### Task 1.1 — Create directory + package.json
**File(s)**: `tools/yana-web/package.json`
**Why**: Establishes the project root and a `start` script; declares zero dependencies to stay clear of the dependency-vetting gate.
**Steps**:
1. Create `tools/yana-web/`.
2. Write `package.json` with: `"name": "yana-web"`, `"version": "0.1.0"`, `"private": true`, `"type": "commonjs"`, `"engines": { "node": ">=18" }`, `"scripts": { "start": "node server.js" }`, and **no** `dependencies` or `devDependencies` keys.
**Proof of completion**:
- [ ] `node -e "const p=require('./tools/yana-web/package.json'); if(p.dependencies) process.exit(1)"` exits 0 (run from repo root).
- [ ] `node -e "JSON.parse(require('fs').readFileSync('tools/yana-web/package.json'))"` exits 0.

### Task 1.2 — Static file server (vanilla http)
**File(s)**: `tools/yana-web/server.js` (initial version — static serving + health only)
**Why**: Serves the frontend and avoids CORS; foundation that Waves 2–3 extend. Built-ins only.
**Steps**:
1. `require('http','fs','path','url')` only.
2. Listen on `process.env.PORT || 8081`, host `0.0.0.0` (Cloud Shell requires binding all interfaces).
3. Route `GET /` → serve `index.html`; `GET /app.js`, `/style.css` → serve with correct `Content-Type` (`text/html`, `application/javascript`, `text/css`). Serve only from the `tools/yana-web/` dir — reject any path containing `..` with 400 (path-traversal guard per execution-environment.md L5).
4. Route `GET /health` → `200 {"ok":true}`.
5. On startup, `console.log` the exact URL: `Yana Web on http://localhost:<port>`.
**Proof of completion**:
- [ ] `node tools/yana-web/server.js &` then `curl -s localhost:8081/health` returns `{"ok":true}`; kill the process after.
- [ ] `curl -s "localhost:8081/../package.json"` returns HTTP 400 (traversal blocked).
- [ ] `node --check tools/yana-web/server.js` passes (per pre-push-verify-law).

---

## Wave 2 — Routing layer [needs Wave 1]

### Task 2.1 — JS fallback classifier
**File(s)**: `tools/yana-web/classifier.js`
**Why**: The Rust binary is absent (see Context #1); the app must classify with zero toolchain. Mirrors `src/route.rs` semantics so output is drop-in compatible.
**Depends on**: 1.1 (project root).
**Steps**:
1. Export `classify(task: string)` returning the exact shape from Context #2 (`route, gate, confidence, reason, matched_signals, suggested_agents`).
2. Port the keyword tables from `src/route.rs`:
   - EXTERNAL signals (gate `confirm`): `git push`, `cargo publish`, `npm publish`, `deploy`, `send email`, `send message`, `webhook`, `api call`, `rm -rf`, `production`. Route `external`, gate `confirm`, agents `["security-engineer","deployment-engineer"]`.
   - COMPLEX signals (gate `harness`): write/multi-file/code-change keywords — `implement`, `refactor`, `sửa bug`, `fix bug`, `add feature`, `create`, `build`, `migrate`, `test`, `debug`. Route `complex`, gate `harness`; if signal contains `test`/`debug` → agents `["qa-engineer"]` else `["backend-developer","code-reviewer"]`.
   - DEFAULT → route `simple`, gate `auto`, agents `[]`.
3. `confidence`: highest matched weight (cap 0.95) for matched routes; `0.5` for default simple. `matched_signals` lists the matched keywords. Matching is case-insensitive and MUST handle Vietnamese input (do not strip non-ASCII).
4. Keep functions ≤ 50 lines (agent-code-constraints). Split helpers if needed.
**Proof of completion**:
- [ ] `node -e "const {classify}=require('./tools/yana-web/classifier.js'); console.log(classify('git push origin main').route)"` prints `external`.
- [ ] `... classify('sửa bug auth middleware').route` prints `complex` (Vietnamese handled).
- [ ] `... classify('what time is it').route` prints `simple`.
- [ ] Returned object has exactly the 6 keys from Context #2.

### Task 2.2 — Router bridge (binary-first, fallback-second)
**File(s)**: `tools/yana-web/router.js`
**Why**: Single function the backend calls; prefers the real yana-router when a binary exists, else uses the JS classifier — invisible to the frontend.
**Depends on**: 2.1 (for fallback).
**Steps**:
1. Export `async function route(task)`.
2. Spawn via `child_process.execFile('node', [WRAPPER, 'route', 'classify', task], { env: process.env, timeout: 5000 })` where `WRAPPER` is an absolute path to `/home/user/yamtam-engine/scripts/yamtam-rt-wrapper.js` (resolve from `__dirname` relative path, do not hardcode `/home/user`).
3. On success + valid JSON parse → return `{ ...decision, source: "yana-router" }`.
4. On ANY error (spawn fail, non-zero exit, unparseable output, timeout) → return `{ ...classify(task), source: "fallback" }`. Never throw to the caller.
**Proof of completion**:
- [ ] `node -e "require('./tools/yana-web/router.js').route('deploy to prod').then(r=>console.log(r.source, r.route))"` prints `fallback external` (binary absent in current env).
- [ ] No unhandled rejection / thrown error when the wrapper errors.

### Task 2.3 — `POST /api/route` endpoint
**File(s)**: `tools/yana-web/server.js` (extend)
**Why**: Exposes routing to the browser so the UI can show the selected path before calling Claude.
**Depends on**: 1.2 (server), 2.2 (route()).
**Steps**:
1. Add `POST /api/route`: read JSON body `{ task }`, cap body at 16 KB (reject larger with 413 — owasp-llm-output / size-cap), reject empty `task` with 400.
2. Call `await route(task)`, respond `200` with the decision JSON.
3. Wrap in try/catch → `500 {"error":"..."}` with no stack leak (security.md: errors don't leak internals).
**Proof of completion**:
- [ ] With server running: `curl -s -X POST localhost:8081/api/route -H 'content-type: application/json' -d '{"task":"git push"}'` returns JSON containing `"route":"external"`.
- [ ] Empty task → HTTP 400. Body > 16 KB → HTTP 413.

---

## Wave 3 — Claude streaming proxy + agent prompts [needs Wave 2]

### Task 3.1 — Agent system-prompt loader
**File(s)**: `tools/yana-web/agents.js`
**Why**: Maps the router's `suggested_agents` to real system prompts from `core/agents/*.md`, with a generic fallback so missing agent files never break the flow (Context #4).
**Depends on**: 1.1.
**Steps**:
1. Export `loadSystemPrompt(suggestedAgents: string[])`.
2. Resolve agents dir as `path.join(__dirname, '..', '..', 'core', 'agents')` (relative — no hardcoded `/home/user`).
3. For the first suggested agent whose `<name>.md` exists: read it, strip the YAML frontmatter (everything between the first two `---` lines), return the markdown body as the system prompt.
4. If no agent suggested or no file found: return a generic prompt: `"You are Yana, a helpful AI task assistant. Complete the user's task clearly and concisely. Respond in the same language as the task."`
5. Cap returned prompt length at 8 KB (truncate with a marker) to bound token use.
**Proof of completion**:
- [ ] `node -e "console.log(require('./tools/yana-web/agents.js').loadSystemPrompt(['frontend-developer']).slice(0,30))"` prints text from frontend-developer.md (not the generic fallback).
- [ ] `... loadSystemPrompt(['nonexistent-agent-xyz'])` returns the generic prompt.
- [ ] `... loadSystemPrompt([])` returns the generic prompt.

### Task 3.2 — `POST /api/chat` streaming proxy
**File(s)**: `tools/yana-web/server.js` (extend)
**Why**: Proxies the browser → Claude API to dodge CORS and to inject the agent system prompt; streams SSE straight through. The user's key passes through and is never stored (security.md, 52-secrets-vault-law).
**Depends on**: 1.2, 3.1.
**Steps**:
1. Add `POST /api/chat`: body `{ task, apiKey, suggestedAgents, model? }`. Cap body 32 KB. Reject missing `apiKey` or `task` with 400.
2. Build system prompt via `loadSystemPrompt(suggestedAgents)`.
3. Open an `https.request` to `api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Body: `{ model: model || "claude-sonnet-4-5", max_tokens: 2048, system: <prompt>, stream: true, messages: [{role:"user", content: task}] }`.
4. Set response headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Pipe the upstream response body to the client response.
5. On upstream error or non-2xx, forward an SSE `event: error` with the upstream status (do NOT log the apiKey anywhere — never `console.log` the body; per 52-secrets-vault-law a key in logs is a violation).
6. Do not retain `apiKey` after the request (no module-level storage).
**Proof of completion**:
- [ ] `grep -c "console.log" tools/yana-web/server.js` shows none logging request bodies/keys (manual read confirms apiKey is never logged).
- [ ] `node --check tools/yana-web/server.js` passes.
- [ ] Endpoint structurally returns `text/event-stream` headers (verified by reading code; live key test deferred to Wave 4 Task 4.1).

---

## Wave 4 — Frontend + verification [needs Wave 3]

### Task 4.1 — index.html (structure + mobile layout)
**File(s)**: `tools/yana-web/index.html`
**Why**: The page shell: API-key field, task input, route-decision card, streaming result card, history sidebar.
**Depends on**: 1.2 (served by server).
**Steps**:
1. `<!doctype html>`, `<meta name="viewport" content="width=device-width, initial-scale=1">` (mobile-friendly).
2. Sections: (a) API-key input row with a "Save key" button and a status pill; (b) task `<textarea>` + "Run" button; (c) route-decision card (route, gate, confidence, agents, signals, source); (d) result card (streamed text); (e) history sidebar `<aside>` listing last 5 tasks.
3. Link `style.css`, `app.js` (defer).
4. Use semantic font stack + `font-size: 16px` body, headings weight ≥ 600 (typography-rules); no font-size < 12px.
**Proof of completion**:
- [ ] Contains a viewport meta tag (`grep 'viewport' tools/yana-web/index.html`).
- [ ] Contains elements with ids the app.js wires to (key input, task input, run button, route card, result card, history list).

### Task 4.2 — style.css (responsive, semantic tokens)
**File(s)**: `tools/yana-web/style.css`
**Why**: Mobile-first responsive layout meeting the project's color/typography gates.
**Depends on**: 4.1.
**Steps**:
1. Define CSS custom properties for colors (semantic tokens — `--color-background`, `--color-foreground`, `--color-primary`, `--color-border`, `--color-muted-foreground`) — no raw hex outside the token block (color-rules).
2. Single-column on narrow screens; sidebar beside main content at `min-width: 768px` via a media query (mobile-friendly requirement).
3. Body text 16px, line-height ≥ 1.5; route badges colored by route (simple/complex/external) but each badge ALSO shows a text label (color-rules: color not sole indicator).
4. Visible focus ring using `--color-ring`.
**Proof of completion**:
- [ ] `grep -c '@media' tools/yana-web/style.css` ≥ 1 (responsive breakpoint present).
- [ ] No raw hex appears outside the `:root` token block (manual read).

### Task 4.3 — app.js (key storage, route call, streaming, history)
**File(s)**: `tools/yana-web/app.js`
**Why**: Wires the full user flow: store key → classify → stream → record history. Pure browser JS, no build step.
**Depends on**: 2.3 (`/api/route`), 3.2 (`/api/chat`), 4.1 (DOM ids).
**Steps**:
1. **Key**: load from `localStorage["yana_api_key"]` on init; "Save key" writes it; status pill shows "key saved" / "no key". Never display the key value back in plaintext beyond a masked indicator.
2. **Run flow**: on Run → `POST /api/route {task}` → render the decision card (route, gate, confidence %, agents, signals, `source` badge showing yana-router vs fallback).
3. **Stream**: then `POST /api/chat {task, apiKey, suggestedAgents}`; read the response body as a stream (`response.body.getReader()`), parse SSE `data:` lines, append `content_block_delta` text deltas to the result card live. Handle `event: error` by showing the message.
4. **History**: after completion, prepend `{task, route, snippet, ts}` to `localStorage["yana_history"]`, keep only the last 5, re-render the sidebar. Clicking a history item refills the task box.
5. Guard: if no key saved, block Run and prompt to save a key. Functions ≤ 50 lines; split (renderDecision, streamChat, saveHistory, etc.).
**Proof of completion**:
- [ ] `node --check tools/yana-web/app.js` passes (syntax).
- [ ] Code reads `localStorage` for `yana_api_key` and `yana_history`, caps history at 5 (manual read).
- [ ] SSE parsing handles `content_block_delta` and trailing partial lines (manual read).

### Task 4.4 — README + end-to-end run check
**File(s)**: `tools/yana-web/README.md`
**Why**: Run instructions for Cloud Shell + records the binary-fallback behavior so the operator isn't surprised.
**Depends on**: all prior tasks.
**Steps**:
1. Document: `cd tools/yana-web && npm start` (or `PORT=8081 node server.js`), open the Cloud Shell Web Preview on port 8081.
2. Note: routing uses the Rust yana-router if built/`$YAMTAM_RT_BIN` is set, otherwise an equivalent JS fallback — both produce the same JSON shape.
3. Note: the API key is stored only in browser localStorage and passes through the proxy per-request; it is never stored or logged server-side.
4. List endpoints: `GET /health`, `POST /api/route`, `POST /api/chat`.
**Proof of completion**:
- [ ] README states port 8081 and the localStorage-only key handling.
- [ ] **E2E smoke (no key needed):** start server, `curl /health` ok, `curl -X POST /api/route -d '{"task":"deploy to production"}'` returns `external`, `GET /` returns the HTML — then kill server.
- [ ] **Streaming check (requires a real key, ask the human to run if no key available):** Run a task in the browser and confirm tokens stream into the result card and a history entry appears.

---

## Verification Checklist

Run after all waves complete. If any fails, the plan is not done:

- [ ] Syntax: `node --check` passes for `server.js`, `router.js`, `classifier.js`, `agents.js`, `app.js` (pre-push-verify-law).
- [ ] Zero npm deps: `package.json` has no `dependencies` key; `tools/yana-web/node_modules` does not exist.
- [ ] Server boots on 8081 and `/health` returns `{"ok":true}`.
- [ ] `/api/route` returns correct routes for: `git push` → external, `implement OAuth` → complex, `what time is it` → simple (matches src/route.rs semantics).
- [ ] Path traversal blocked (`/../package.json` → 400).
- [ ] API key never appears in any `console.log` or server-side file (grep `server.js`, `router.js` for `apiKey` near `console.log` → none).
- [ ] No file outside `tools/yana-web/` was created or modified: `git status --porcelain | grep -v '^?? tools/yana-web/' | grep -v '^?? .planning/'` is empty (scope-drift-law / out-of-scope).
- [ ] Goal check: a user can save a key, type a task, see the route decision (with source badge), watch the answer stream in, and see it in a 5-item history — verified in browser on port 8081.

---

## Out of Scope

This plan explicitly does NOT:
- Build, install, or require the Rust `yamtam-rt` binary, or install cargo (JS fallback covers it).
- Install Express or any npm runtime dependency (built-ins only — avoids the dependency-vetting gate).
- Add auth, user accounts, or rate limiting beyond body-size caps.
- Persist history or API keys server-side or in any database (localStorage only).
- Deploy to production / configure HTTPS / a custom domain (local Cloud Shell port 8081 only).
- Modify any existing yamtam-engine file outside `tools/yana-web/` (including `site/`, `core/agents/`, `scripts/`).
- Reuse or alter the existing Astro `site/` setup.
- Implement multi-turn conversation memory (each task is a single-shot request).

---

## Open Questions (resolve before/at execution)

1. **Default Claude model** — plan assumes `claude-sonnet-4-5`. Confirm the exact model id the user's key has access to, or expose a model dropdown (currently a single default + optional `model` field in `/api/chat`).
2. **Streaming live test needs a real Anthropic key** — Tasks 3.2/4.4 can be structurally verified without one, but the actual token-stream proof requires the human to run one task in the browser with their key. Confirm a test key will be available, or accept structural verification + manual sign-off.
3. **Port** — brief header said 8080, brief body said 8081 (8080 is taken by codexmate). Plan uses **8081**. Confirm.
