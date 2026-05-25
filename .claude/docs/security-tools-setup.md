# YAMTAM ENGINE — Security Tools Setup

**Status:** Active
**Used by:** `core/scripts/run-security-tools.sh`, `core/skills/red-team-check`
**Origin:** yamtam (original)

---

## Purpose

`run-security-tools.sh` runs available security tools automatically before
Claude's manual OWASP review. Tools are skipped silently if not installed —
no tool is required, but each one you install adds real coverage.

Install the tools that match your stack. A Node.js project needs npm audit.
A Python project needs pip-audit + bandit. Everyone benefits from gitleaks.

---

## Tools

### gitleaks — Secret Scanning
**Finds:** Hardcoded API keys, tokens, passwords, private keys in any file or git history.
**Covers:** OWASP A02 (Cryptographic Failures)

```bash
# macOS
brew install gitleaks

# Linux
curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/main/scripts/install.sh | sh -s -- -b /usr/local/bin

# Verify
gitleaks version
```

**Why install this first:** Catches the most common real-world breach vector — accidentally committed secrets. Takes < 30 seconds to run.

---

### semgrep — SAST (Static Analysis)
**Finds:** Injection flaws, XSS, JWT misuse, OWASP Top 10 patterns across 30+ languages.
**Covers:** OWASP A01, A02, A03, A07, A08

```bash
# macOS / Linux (pip)
pip install semgrep

# macOS (brew)
brew install semgrep

# Verify
semgrep --version
```

**Rulesets used by YAMTAM:**
- `p/owasp-top-ten` — OWASP Top 10 patterns
- `p/secrets` — secret detection (complements gitleaks)
- `p/injection` — SQL, command, LDAP injection
- `p/jwt` — JWT algorithm confusion, weak signing
- `p/xss` — Cross-site scripting patterns

**Note:** Free tier with public rulesets. No account required for `p/` rules.

---

### trivy — Dependency CVEs + Secrets
**Finds:** Known CVEs in npm/pip/go/cargo/ruby/java dependencies. Also scans for secrets in files.
**Covers:** OWASP A06 (Vulnerable and Outdated Components)

```bash
# macOS
brew install trivy

# Linux
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Verify
trivy --version
```

**Best for:** Dependency vulnerability scanning. Covers more ecosystems than any single-language tool.

---

### npm audit — Node.js CVEs
**Finds:** Known CVEs in Node.js packages.
**Covers:** OWASP A06

```bash
# Already installed if you have Node.js
npm --version

# Run manually
npm audit --audit-level=moderate
```

**Note:** `npm audit` may modify `package-lock.json` in fix mode. YAMTAM runs it read-only (no `--fix` flag).

---

### pip-audit — Python CVEs
**Finds:** Known CVEs in Python packages from PyPI and OSV databases.
**Covers:** OWASP A06

```bash
pip install pip-audit

# Verify
pip-audit --version
```

---

### bandit — Python SAST
**Finds:** Python-specific security issues: SQL injection, hardcoded passwords, subprocess injection, use of weak crypto, insecure deserialization.
**Covers:** OWASP A02, A03

```bash
pip install bandit

# Verify
bandit --version
```

---

### govulncheck — Go CVEs
**Finds:** Known vulnerabilities in Go module dependencies.
**Covers:** OWASP A06

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest

# Verify
govulncheck -version
```

---

### cargo audit — Rust CVEs
**Finds:** Known vulnerabilities in Rust crate dependencies (RustSec Advisory Database).
**Covers:** OWASP A06

```bash
cargo install cargo-audit

# Verify
cargo audit --version
```

---

## Recommended Install Order

Install based on your stack:

| Stack | Install |
|-------|---------|
| Any project | `gitleaks` + `semgrep` + `trivy` |
| Node.js | + `npm` (already present) |
| Python | + `pip-audit` + `bandit` |
| Go | + `govulncheck` |
| Rust | + `cargo audit` |

**Minimum useful setup (any stack):**
```bash
brew install gitleaks semgrep trivy   # macOS
# or
pip install semgrep && brew install gitleaks trivy   # Linux/mixed
```

---

## How YAMTAM Uses These Tools

1. `/security-scan` triggers `core/skills/red-team-check`
2. `red-team-check` Step 0 runs `bash core/scripts/run-security-tools.sh`
3. Tool output is shown to Claude as structured findings
4. Claude merges tool findings with its own manual OWASP review (Step 2)
5. Combined findings feed into `blue-team-fix` and `purple-team-report`

Tool findings count toward Anti-Fake-Pass evidence. A finding from `gitleaks` is Hard Evidence. A finding from Claude's manual review is Soft Evidence.

---

## Environment Variable

```bash
# Required before running tools (set by security-scope-gate)
export YAMTAM_SCOPE_CONFIRMED=1

# Run all available tools
bash core/scripts/run-security-tools.sh --mode deep

# Quick mode (CRITICAL only, secrets only)
bash core/scripts/run-security-tools.sh --mode quick

# Targeted on specific path
bash core/scripts/run-security-tools.sh --mode targeted --target src/auth/
```

---

## Output

Tool run results are saved to `.claude/state/security-tools-last-run.log` (gitignored).
Findings appear in stdout — Claude reads them as part of the red-team-check flow.
