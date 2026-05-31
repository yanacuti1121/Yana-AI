---
name: openhack-security-review
description: Scenario-first whitebox security vulnerability research using the OpenHack methodology (Hadrian Security). 12 OWASP 2025-aligned expert families, recon → route → scenario → triage pipeline. Use for deep source-code audit on a target repo — not for quick YAMTAM rule checks (use strix-scan.sh for that).
license: MIT (methodology adapted from hadriansecurity/openhack)
source: https://github.com/hadriansecurity/openhack
---

# OpenHack Security Review

Scenario-first, checkpointed vulnerability research designed to run inside LLM coding harnesses (Claude Code, Codex, Cursor).

**Not a scanner.** Does not look for pattern matches. Instead: discovers surfaces → routes to experts → proves/disproves hypotheses → triages findings.

---

## When to Use This vs strix-scan

| Situation | Use |
|-----------|-----|
| Quick rule compliance check | `strix-scan.sh` (L1–L5) |
| Full vulnerability research on a codebase | `openhack-security-review` |
| Before a production release of a security-sensitive system | Both |
| Auditing a third-party repo | `openhack-security-review` |
| CI gate on every commit | `strix-scan.sh` only |

**Trigger phrases:** "deep security audit", "whitebox pentest", "vuln research", "OWASP scan", "find vulns in this repo", "security review before launch"

---

## The 4-Phase Pipeline

```
Phase 0 — Recon          Surface discovery
        ↓
Phase 1 — Routing        Cluster surfaces → assign to experts
        ↓
Phase 2 — Expert Loop    12 families prove/disprove hypotheses
        ↓
Phase 3 — Triage         Severity, dedup, confidence gate
        ↓
findings/               Final accepted vulnerability reports
```

Human approves between each phase. No phase runs without the previous phase's artifacts.

---

## Phase 0 — Recon

Discover attack surfaces before any vulnerability analysis.

**What to collect:**

| Artifact | What to look for |
|----------|-----------------|
| `routes` | HTTP endpoints, route declarations, path params |
| `inputs` | Request body parsers, file upload handlers, query params |
| `sinks` | SQL/NoSQL queries, shell calls, file operations, template renders, redirects |
| `auth-boundaries` | Middleware chains, permission checks, session validation |
| `exposures` | Admin/debug/metrics paths, default credentials, deploy configs |
| `request-boundaries` | Externally reachable endpoints from framework config |

**Recon prompt template:**

```
You are performing recon on a codebase for security review.
Target: <path>
Language/framework: <detected>

For each category below, list every discovered surface with:
- file:line reference
- category (route/input/sink/auth-boundary/exposure)
- brief description of what it does and why it's security-relevant

Categories: routes, inputs, sinks, auth-boundaries, exposures
Output as JSONL, one item per line.
```

**Semgrep enrichment (optional):**
```bash
semgrep --config=auto --json <target> | \
  jq '.results[] | {path: .path, line: .start.line, check: .check_id, message: .extra.message}'
```

---

## Phase 1 — Routing

Group related surfaces into **routing units** (one unit = one review context).

Rules:
- Same controller/handler → same unit
- Related sink + its input sources → same unit
- Max 5 surfaces per unit (keeps expert context focused)

Each routing unit gets assigned to 1–3 expert families.

**Router prompt output format:**
```json
{
  "routing_unit_id": "RU-001",
  "surfaces": ["routes:POST /api/user", "sinks:db.query(sql)"],
  "assigned_experts": ["injection", "broken-access-control"],
  "proof_question": "Can attacker-controlled input reach the SQL sink without sanitization?"
}
```

---

## Phase 2 — The 12 Expert Families

Each expert has a **root-cause family**, **OWASP/CWE ID**, and specific techniques.

### Expert 01 — Broken Access Control (A01:2025)
- Horizontal/vertical privilege escalation
- BOLA: object references not verified against authenticated user
- SSRF (CWE-918): user-controlled URLs fetched server-side
- Workflow bypass, elevation of privilege
- Cross-tenant/cross-user boundary breaks

**Routing signals:** `user_id`, `owner`, `resource`, `fetch`, `request`, `url_param`, `authorization`, `role`, `admin`

### Expert 02 — Security Misconfiguration (A02:2025)
- Default credentials, exposed admin interfaces
- Missing security headers (CSP, HSTS, X-Frame-Options)
- Debug endpoints exposed in production
- Framework defaults left enabled (debug=True, verbose errors)
- CORS misconfiguration (wildcard with credentials)

**Routing signals:** `debug`, `cors`, `headers`, `config`, `settings`, `admin`, `credentials`

### Expert 03 — Software & Supply Chain Failures (A03:2025)
- Unpinned dependency versions
- `postinstall` scripts with network calls
- Package name typosquatting signals
- Integrity hash absent in lockfiles
- `npm install` from git URLs without pinned SHAs

**Routing signals:** `package.json`, `requirements.txt`, `Cargo.toml`, `install`, `import`

### Expert 04 — Cryptographic Failures (A04:2025)
- Weak algorithms: MD5/SHA1 for integrity, ECB mode, DES
- Hardcoded keys/IVs, predictable randomness
- `Math.random()` / `random.random()` for security purposes
- Missing TLS verification (`verify=False`, `rejectUnauthorized: false`)
- JWT: `none` algorithm, weak HMAC key, expired not checked

**Routing signals:** `crypto`, `hash`, `sign`, `jwt`, `token`, `random`, `secret`, `key`, `ssl`

### Expert 05 — Injection (A05:2025)
- SQL: identifiers, ORDER BY, LIKE escape, ORM raw queries
- NoSQL: operator injection (`$where`, `$regex`), Elasticsearch DSL
- OS command: argv, option files, environment variables, PATH manipulation
- SSTI: render-from-string, dynamic templates, sandbox escape
- XSS: JSON-in-script, DOM clobbering, SVG/MathML, `dangerouslySetInnerHTML`
- Prototype pollution: `__proto__`, `constructor.prototype`, recursive merge

**Routing signals:** `query`, `exec`, `eval`, `template`, `render`, `sql`, `shell`, `format`, `innerHTML`

### Expert 06 — Memory & Buffer Errors (CWE-119)
- Buffer overflows, off-by-one, use-after-free
- Integer overflow in size calculations
- Unsafe `memcpy`/`strcpy` without bounds check
- C/C++/Rust `unsafe` blocks with pointer arithmetic
- Python `ctypes`, FFI calls

**Routing signals:** `unsafe`, `memcpy`, `malloc`, `free`, `ctypes`, `ffi`, `ptr`

### Expert 07 — Insecure Design (A06:2025)
- Missing rate limiting on sensitive operations
- Business logic flaws (negative quantities, price manipulation)
- Insufficient anti-automation (no CAPTCHA, no attempt limits)
- Insecure direct object reference in API design
- Multi-step workflow state not validated server-side

**Routing signals:** `rate_limit`, `retry`, `price`, `quantity`, `step`, `workflow`, `state`

### Expert 08 — Authentication Failures (A07:2025)
- Password policy absent or trivially bypassable
- Session tokens predictable or not rotated after privilege change
- MFA bypass via parameter manipulation
- Account enumeration via timing or error message differences
- Password reset flaws (token not expiring, predictable token)

**Routing signals:** `login`, `password`, `session`, `token`, `auth`, `mfa`, `reset`, `logout`

### Expert 09 — Software Data Integrity Failures (A08:2025)
- Unsafe deserialization (pickle, yaml.load, eval(json))
- Missing signature verification on downloaded updates
- CI/CD pipeline accepting unsigned artifacts
- Auto-update mechanism without integrity check

**Routing signals:** `pickle`, `yaml.load`, `deserialize`, `eval`, `update`, `download`, `unpack`

### Expert 10 — Sensitive Information Exposure (CWE-200)
- Secrets in logs, error messages, stack traces
- PII in URLs (GET params with email/SSN)
- Overly verbose API responses (password hash, internal IDs)
- Sensitive fields not masked in audit logs

**Routing signals:** `log`, `error`, `exception`, `response`, `json`, `debug`, `print`

### Expert 11 — Path Traversal & Unrestricted Upload (CWE-22/434)
- `../` in user-controlled file paths without normalization
- File type checked by extension only (not MIME + magic bytes)
- Upload destination user-controlled
- Symlink following in archive extraction (zip slip)
- Serving files from user-controlled paths

**Routing signals:** `file`, `path`, `upload`, `extract`, `zip`, `tar`, `open`, `read`, `write`

### Expert 12 — Unrestricted Resource Consumption (CWE-770)
- No request size limit on file uploads / JSON bodies
- Regex without ReDoS protection on user input
- Unbounded DB queries (no pagination, no LIMIT)
- Missing timeout on external HTTP calls
- Recursive processing without depth limit

**Routing signals:** `size`, `limit`, `timeout`, `regex`, `query`, `loop`, `recursive`

---

## Proof Obligations (Evidence Bar)

A finding is **only valid** when ALL of the following are demonstrated:

```
1. REACHABLE ENTRYPOINT    — attacker can reach this code path
2. ATTACKER-CONTROLLED INPUT — the dangerous value is attacker-supplied
                               (including stored/second-order flows)
3. SENSITIVE SINK           — the value reaches a dangerous operation
4. MISSING/WRONG GUARD     — no sanitization, or guard is bypassable
                               in the specific context
5. CONCRETE IMPACT          — what can attacker actually do?
```

**Without all 5, verdict = `rejected` or `needs_context`.**

Evidence format per finding:
```json
{
  "title": "SQL injection via unsanitized user_id parameter",
  "severity": "critical",
  "expert": "injection",
  "evidence": [
    {"file": "src/api/users.ts", "line": 42, "snippet": "db.query(`SELECT * FROM users WHERE id=${req.params.id}`)"},
    {"file": "src/routes/users.ts", "line": 15, "snippet": "router.get('/users/:id', getUser)"}
  ],
  "attacker_role": "unauthenticated",
  "preconditions": "None — endpoint is public",
  "attack_chain": "GET /users/1' OR 1=1-- → SQL bypasses filter → full table dump",
  "impact": "Full database read, potential authentication bypass",
  "recommended_fix": "Use parameterized query: db.query('SELECT * FROM users WHERE id = ?', [req.params.id])"
}
```

---

## Phase 3 — Triage

Independent review of each finding candidate:

| Decision | Meaning |
|----------|---------|
| `accepted` | Evidence complete, impact confirmed, report it |
| `downgraded` | Real but severity lower than claimed |
| `duplicate` | Same vuln as existing finding |
| `rejected` | Evidence incomplete, proof obligations not met |
| `needs_context` | Requires more code context to decide |

Only `accepted` and `downgraded` become final findings.

---

## Running with YAMTAM strix-scan.sh

```bash
# Expert mode — 12 OWASP families (slow, thorough)
bash core/scripts/strix-scan.sh --mode experts --target src/

# Full mode — rules + experts
bash core/scripts/strix-scan.sh --mode full --target .

# Single expert family
bash core/scripts/strix-scan.sh --mode experts --expert injection --target src/

# With semgrep hints (requires semgrep installed)
bash core/scripts/strix-scan.sh --mode experts --semgrep --target src/
```

---

## Anti-Fake-Pass Rules

```
❌ Finding without file:line evidence = REJECTED
❌ "Potential SQL injection" without confirming attacker can reach it = REJECTED
❌ Scanner hit (semgrep match) alone = finding CANDIDATE, not confirmed finding
❌ "This function is dangerous" without tracing input to dangerous call = REJECTED
❌ CRITICAL severity without documenting attacker role and attack chain = DOWNGRADED
❌ Reporting findings based on code patterns that exist but are unreachable = REJECTED
```

---

## See Also

- `core/scripts/strix-scan.sh` — fast L1-L5 rule check
- `core/rules/api-security-gate.md` — OWASP API Top 10
- `core/rules/prompt-jailbreak-guard.md` — LLM injection defense
- `core/rules/network-egress-law.md` — SSRF prevention
- `core/skills/red-team-check/SKILL.md` — offensive mindset guide
- `core/skills/penetration-tester` agent — full pentest agent
