#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: L1.5 Tool Use Validation — schema-validate tool inputs, block path traversal and SSRF
# Last Reviewed: 2026-05-24
# PreToolUse hook — fires before any tool call to validate input structure and safety.
#
# Validates:
#   Bash       — control-field validation (e.g. timeout must be numeric)
#   Write/Edit — path traversal prevention (../../), absolute paths outside project
#   WebFetch   — URL format validation, SSRF guard (private IP ranges blocked)
#   All tools  — tool name allowlist check (blocks unknown/phantom tools)
#
# Exit behaviour:
#   exit 0          — allow
#   JSON + exit 2   — block
#   additionalContext + exit 0 — warn
#
# Bypass: YANA_TOOL_VALID_BYPASS=1
# Test seam: TOOL_VALID_TEST_INPUT="<json>"

set -uo pipefail

[[ "${YANA_TOOL_VALID_BYPASS:-}" == "1" ]] && exit 0

# BUG FIX (found in independent review, round 6): this used to be a bare
# `command -v jq >/dev/null 2>&1 || exit 0` — a completely silent exit,
# zero output, on ANY environment missing jq. That disables every check
# in this file (path traversal, sensitive-path blocking, the SSRF guard)
# with no warning and no attacker involvement whatsoever — a container
# or fresh dev machine without jq installed hits
# this with nothing more than its own absence. Violates this file's own
# CLAUDE.md rule ("Hooks must never silently allow a risky action... A
# hook that does nothing without explanation is worse than no hook").
# Plain-text stderr is used here (not the jq-built JSON warn() helper
# below) because jq itself is what's missing — the helpers that build
# hookSpecificOutput JSON aren't usable yet at this point.
if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  Tool Validator [L1.5]: jq not found — ALL validation disabled (path traversal, sensitive-path, SSRF checks skipped). Install jq to restore protection." >&2
  exit 0
fi

# ── Read input ────────────────────────────────────────────────────────────────

if [[ -n "${TOOL_VALID_TEST_INPUT:-}" ]]; then
  INPUT="$TOOL_VALID_TEST_INPUT"
else
  INPUT=$(cat)
fi

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ -z "$TOOL_NAME" ]] && exit 0

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 2
}

warn() {
  local msg="$1"
  jq -n --arg msg "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $msg
    }
  }'
  exit 0
}

# ── Tool allowlist — block phantom/unknown tools ──────────────────────────────
KNOWN_TOOLS="Bash|Read|Write|Edit|MultiEdit|WebFetch|WebSearch|TodoRead|TodoWrite|Task|ExitPlanMode|EnterPlanMode|dispatch_agent|computer"
if ! printf '%s' "$TOOL_NAME" | grep -qE "^($KNOWN_TOOLS)$"; then
  warn "⚠️  Tool Validator [L1.5]: Unknown tool '${TOOL_NAME}' requested. This tool is not in the Yana AI known-tools allowlist. Verify this tool exists and is expected before allowing. Reference: core/hooks/tool-validator.sh"
fi

# ── Bash: control field validation ─────────────────────────────────────────────
# BUG FIX (found live-testing, 2026-08-15/16 — reproduced directly against a
# clean origin/main checkout, not assumed): this block used to also check
# $CMD for an embedded NUL byte. Confirmed by direct reproduction that check
# was unconditionally broken, not just a weak fallback: `grep -q $'\x00'` —
# bash's ANSI-C quoting can't represent a NUL inside `$'...'`, so it silently
# collapses to an empty pattern, and `grep -q ''` matches any non-empty
# input. Combined with `||`, that made the whole check true for every Bash
# command regardless of the (correct) first `grep -qP '\x00'` result, denying
# 100% of Bash calls — reproduced live with a plain `echo hi` on this exact
# file at HEAD. Separately confirmed the check was also structurally unable
# to ever catch a real null byte even if the fallback were removed: bash's
# own `$(...)` command substitution strips embedded NULs before `CMD` is
# populated (verified: `echo a<NUL>b` through the exact `jq -r` + `$(...)`
# pipeline this file uses comes out as `echo ab`, no 0x00 byte, nothing
# truncated), so `$CMD` can never contain one to detect by the time this code
# runs. Removed rather than repaired — the CLAUDE.md rule in this directory
# ("must never silently allow a risky action") does not apply here, since
# this check could not detect a real null byte in the first place; there is
# nothing to preserve.
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

  # Command timeout field validation — must be a number if present
  TIMEOUT_VAL=$(printf '%s' "$INPUT" | jq -r '.tool_input.timeout // ""' 2>/dev/null || true)
  if [[ -n "$TIMEOUT_VAL" ]] && ! printf '%s' "$TIMEOUT_VAL" | grep -qE '^[0-9]+$'; then
    deny "Blocked [L1.5 Tool Validator]: Invalid 'timeout' field in Bash tool input — must be a non-negative integer, got: '${TIMEOUT_VAL}'. Bypass: YANA_TOOL_VALID_BYPASS=1"
  fi
fi

# ── Write / Edit: path traversal prevention ───────────────────────────────────
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "MultiEdit" ]]; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null || true)

  if [[ -z "$FILE_PATH" && "$TOOL_NAME" == "MultiEdit" ]]; then
    FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
  fi

  if [[ -n "$FILE_PATH" ]]; then
    # Sensitive system paths — always block (check before absolute path warn)
    if printf '%s' "$FILE_PATH" | grep -qE '^(/etc/(passwd|shadow|sudoers|hosts|crontab|ssh)|/root/|/proc/|/sys/)'; then
      deny "Blocked [L1.5 Tool Validator]: Write to sensitive system path '${FILE_PATH}' is not allowed. System files must not be written by AI agents. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Path traversal: ../../ sequences targeting outside project root
    if printf '%s' "$FILE_PATH" | grep -qE '(^|/)\.\.(/|$)'; then
      deny "Blocked [L1.5 Tool Validator]: Path traversal detected in '${FILE_PATH}'. Sequences like '../..' can escape the project root. Use absolute paths within the project or project-relative paths. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Absolute paths outside project root (warn, not block — may be legitimate)
    PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    if [[ "$FILE_PATH" == /* ]] && [[ "$FILE_PATH" != "$PROJECT_ROOT"* ]]; then
      warn "⚠️  Tool Validator [L1.5]: Write/Edit target '${FILE_PATH}' is outside the project root '${PROJECT_ROOT}'. Confirm this is intentional. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi
  fi
fi

# ── WebFetch: URL validation and SSRF guard ───────────────────────────────────
# SECURITY (found in review, 2026-08-11): the previous version of this guard
# only regex-matched the LITERAL hostname string in the URL. Real bypasses
# confirmed against the exact code that shipped here:
#   - http://evil.com@169.254.169.254/steal — URL userinfo syntax; the
#     extracted "host" string was "evil.com@169.254.169.254", which matches
#     no private-IP pattern, while a real HTTP client connects to the part
#     after '@' (RFC 3986 authority = [userinfo@]host[:port])
#   - http://0x7f.0.0.1/, http://2130706433/, http://017700000001/ — hex,
#     decimal, and octal IP notations. These are legacy inet_aton-compatible
#     forms real OS resolvers (and therefore real HTTP clients) normalize to
#     127.0.0.1 — confirmed directly via socket.getaddrinfo() — but no
#     dotted-quad regex can enumerate every encoding of "loopback".
#   - http://[::1]/ — IPv6 bracket syntax; the old `${HOST%%:*}` strip cut at
#     the first colon INSIDE the brackets, leaving "[" as the extracted host.
# Fix: resolve the host through the real OS resolver (matches what WebFetch's
# actual HTTP client will connect to, not what the URL text merely claims)
# and classify the RESOLVED address via Python's ipaddress module instead of
# a literal-string regex. Fail-closed on an unresolvable host, since an
# unverifiable destination isn't a destination this guard can call safe.
if [[ "$TOOL_NAME" == "WebFetch" ]]; then
  URL=$(printf '%s' "$INPUT" | jq -r '.tool_input.url // ""' 2>/dev/null || true)

  if [[ -n "$URL" ]]; then
    # Must be http or https
    if ! printf '%s' "$URL" | grep -qE '^https?://'; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch URL '${URL}' must use http:// or https:// scheme. Other schemes (file://, ftp://, data://) are not allowed. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Portable scheme-strip (no sed \? — that's a GNU extension; BSD/macOS
    # sed treats it as a literal "?" and never strips the scheme, which
    # silently defeats every check below on macOS while passing on Linux CI).
    AUTHORITY="${URL#http://}"
    AUTHORITY="${AUTHORITY#https://}"
    AUTHORITY="${AUTHORITY%%/*}"

    # URL parser confusion: reject outright rather than try to parse a
    # userinfo-bearing authority correctly — network-egress-law.md's own
    # prescribed rule (`grep -qP '://[^/]*@'`), applied here directly.
    if [[ "$AUTHORITY" == *"@"* ]]; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch URL '${URL}' contains '@' before the path (URL userinfo syntax). This can hide the real connection target from host-string checks. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # IPv6 literal ([::1], [fd00::1]:8080) must have its brackets stripped
    # BEFORE any port-split — the address itself contains colons, so
    # stripping at the first ':' before removing the brackets cuts the
    # address apart (this was a real bug caught in review: it left HOST as
    # a bare '[' for http://[::1]/, which then failed to resolve and was
    # denied for the wrong reason — "could not be resolved" instead of the
    # correct "resolves to a loopback address").
    if [[ "$AUTHORITY" == \[*  ]]; then
      HOST="${AUTHORITY#\[}"
      HOST="${HOST%%\]*}"
    else
      HOST="${AUTHORITY%%:*}"
    fi

    # KNOWN LIMITATION (round 5 review, 2026-08-11, not fixable within this
    # hook's own design — documented rather than silently accepted): this
    # invokes `python3` by bare name, trusting whatever PATH resolves it
    # to. The exactly-one-sentinel-match check above closes the specific
    # "benign wrapper interop" (rounds 2-3) and "trailing spoofed line"
    # (round 4) bugs, but round 5 confirmed live that a python3 on PATH
    # which genuinely runs the real interpreter as a subprocess, then
    # SUPPRESSES its real "SSRF_VERDICT:blocked:..." line and substitutes
    # its own "SSRF_VERDICT:ok", still produces exactly one match and is
    # indistinguishable from an untampered result by any stdout-parsing
    # protocol — no string format on stdout can prove who produced it.
    # core/hooks/CLAUDE.md's own "no hardcoded machine-specific paths"
    # rule rules out the one structural fix (pin an absolute interpreter
    # path) without breaking portability across machines/CI, and every
    # other hook in this directory has the identical PATH-trust exposure
    # for jq/grep/bash/etc., not just this one for python3 — an attacker
    # able to plant an executable earlier on PATH than the real `python3`
    # inside Claude Code's own execution environment can equally shadow
    # any other tool this hook (or any hook) calls, or just patch this
    # file directly. That's a compromise of the environment hooks run in,
    # which is out of scope for what a single PreToolUse hook can defend
    # against — not a gap specific to the SSRF logic below.
    #
    # KNOWN LIMITATION (round 6 review, 2026-08-11): this is a
    # check-then-allow guard, not connection-pinning — it resolves the
    # host once here, classifies that snapshot, then (on allow) returns
    # exit 0 and the actual WebFetch tool call does its OWN independent
    # DNS resolution afterward. Nothing pins the IP validated here to the
    # IP WebFetch actually connects to, so a DNS answer that changes
    # between these two resolutions (short TTL, split-horizon, an
    # attacker-controlled authoritative server) is a real gap — the
    # exact DNS-rebinding scenario core/rules/network-egress-law.md's own
    # "DNS rebinding defense" section names, whose prescribed fix
    # (`curl --resolve` to pin the IP for the actual request) isn't
    # available here since this hook doesn't make the real request;
    # WebFetch is a separate built-in tool this hook can't control after
    # approving it. Documented rather than silently accepted, same as
    # the python3-trust limitation above — not fixed in this round.
    if command -v python3 >/dev/null 2>&1; then
      SSRF_VERDICT=$(python3 - "$HOST" << 'PYEOF'
import ipaddress
import socket
import sys

def classify():
    host = sys.argv[1]
    cgnat = ipaddress.ip_network('100.64.0.0/10')  # Alibaba Cloud metadata
    # (100.100.100.200) lives here; NOT covered by ip_address().is_private
    # (RFC 6598 shared address space is routable within an ISP, so most IP
    # libraries don't treat the whole block as "private").
    infos = socket.getaddrinfo(host, None)
    for info in infos:
        addr = info[4][0].split('%')[0]  # strip an IPv6 zone id if present
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if is_unsafe(ip, cgnat):
            return f'blocked:{addr}'
    return 'ok'

def is_unsafe(ip, cgnat):
    # BUG FIX (found in review): `ip in cgnat` on an IPv6Address silently
    # returns False for a version mismatch instead of raising or matching
    # the embedded v4 address — confirmed live that an IPv4-mapped IPv6
    # literal (http://[::ffff:100.100.100.200]/) reached the real Alibaba
    # Cloud metadata IP while passing every check here, is_loopback through
    # is_multicast included, because none of those properties unwrap a
    # mapped address either. Re-run the full battery against the mapped v4
    # form too when present, not just the cgnat check, since Python's own
    # is_* properties turned out NOT to unwrap ::ffff:/96 addresses for
    # classification despite handling some other IPv6 cases correctly.
    if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast:
        return True
    if isinstance(ip, ipaddress.IPv4Address) and ip in cgnat:
        return True
    mapped = getattr(ip, 'ipv4_mapped', None)
    if mapped is not None and is_unsafe(mapped, cgnat):
        return True
    return False

# Fail-closed default (review Finding 3): ANY exception anywhere in
# classify() — not just socket.getaddrinfo() failing to resolve — must
# fall through to 'resolve-failed' so the bash side denies. A bare
# unhandled exception here would print nothing, leaving $SSRF_VERDICT
# empty on the bash side, which (with no matching if/elif branch) fell
# through to an implicit allow — confirmed this was live-reproducible
# against an earlier draft of this same refactor before this wrapper
# was added.
#
# SSRF_VERDICT: sentinel prefix (round-3 review hardening): a fake or
# wrapped python3 on PATH (a corporate MDM/EDR wrapper, a conda/pyenv
# activation banner, a stray sitecustomize.py print) can legitimately put
# harmless extra text on stdout before the real interpreter's own output
# — confirmed live that this made a completely safe URL fail closed under
# the plain `$SSRF_VERDICT == "ok"` exact-match this replaces, since any
# such noise made the captured string no longer equal exactly "ok". The
# bash side now takes only the LAST line starting with this exact
# prefix, so arbitrary preceding noise on stdout is tolerated while an
# output with no such line at all still correctly denies as unrecognized.
try:
    print(f'SSRF_VERDICT:{classify()}')
except Exception:
    print('SSRF_VERDICT:resolve-failed')
PYEOF
)
      # BUG FIX (found in independent review, round 4): picking a sentinel
      # line by POSITION ("the last one wins", via `tail -n1`) is itself
      # spoofable — live-reproduced that a python3 wrapper which runs the
      # real interpreter as a subprocess (not `exec`, which would replace
      # the process image) and then prints its OWN "SSRF_VERDICT:ok" line
      # AFTER it silently overrides the real verdict, since the fake line
      # is now the last one. This is not a contrived attack surface: it's
      # the exact "PATH-shadowed python3 wrapper" scenario rounds 2 and 3
      # already treat as in-scope (see the comments above and the
      # FAKEPY_BIN/NOISY_BIN/CRLF_BIN test fixtures), just from the other
      # temporal direction. Fix: require EXACTLY ONE line matching the
      # sentinel prefix. Zero matches (no real verdict reached stdout at
      # all) and 2+ matches (ambiguous — could be spoofed-before,
      # spoofed-after, or a genuine collision) both fail closed the same
      # way, via the existing "unrecognized verdict" deny branch below —
      # this removes the position-dependent trust entirely rather than
      # picking a different, equally-beatable fixed position.
      SSRF_MATCHES=$(printf '%s\n' "$SSRF_VERDICT" | grep -c '^SSRF_VERDICT:')
      if [[ "$SSRF_MATCHES" == "1" ]]; then
        SSRF_VERDICT=$(printf '%s\n' "$SSRF_VERDICT" | grep '^SSRF_VERDICT:')
        SSRF_VERDICT="${SSRF_VERDICT#SSRF_VERDICT:}"
        SSRF_VERDICT="${SSRF_VERDICT%$'\r'}"
      else
        SSRF_VERDICT="ambiguous:${SSRF_MATCHES}-sentinel-lines"
      fi
      if [[ "$SSRF_VERDICT" == blocked:* ]]; then
        RESOLVED="${SSRF_VERDICT#blocked:}"
        deny "Blocked [L1.5 Tool Validator]: WebFetch host '${HOST}' resolves to '${RESOLVED}', a private/loopback/link-local/reserved address (SSRF guard). Fetching internal network addresses may expose internal services or cloud credentials. Bypass: YANA_TOOL_VALID_BYPASS=1"
      elif [[ "$SSRF_VERDICT" == "resolve-failed" ]]; then
        deny "Blocked [L1.5 Tool Validator]: WebFetch host '${HOST}' could not be resolved. Fail-closed: an unresolvable host cannot be verified safe. Bypass: YANA_TOOL_VALID_BYPASS=1"
      elif [[ "$SSRF_VERDICT" != "ok" ]]; then
        # BUG FIX (found in independent review, round 2): the try/except
        # wrapper around classify() only catches exceptions raised INSIDE
        # the Python process. It does nothing if the python3 invocation
        # itself produces no output or unexpected output for a reason
        # outside that try block — e.g. a PATH-shadowing wrapper script
        # that prints a banner before delegating to the real interpreter,
        # or the interpreter being killed/failing before reaching the
        # try. Live-reproduced: both cases left $SSRF_VERDICT as neither
        # "blocked:*" nor "resolve-failed", which (with no else here)
        # fell through to the trailing `exit 0` — a fully silent allow of
        # the exact SSRF targets this guard exists to block, with no
        # deny, no warning, no trace at all. "ok" is now the only
        # recognized allow value; anything else denies.
        deny "Blocked [L1.5 Tool Validator]: WebFetch host '${HOST}' SSRF check produced an unrecognized verdict ('${SSRF_VERDICT}'). Fail-closed: an unverifiable result cannot be treated as safe. Bypass: YANA_TOOL_VALID_BYPASS=1"
      fi
    else
      # No python3 on PATH — degrade to the original literal-string checks
      # rather than skipping SSRF validation entirely.
      #
      # BUG FIX (found in review): `warn()` unconditionally calls `exit 0`
      # (it's meant for standalone advisory call sites, not a mid-script
      # notice) — the first version of this branch called `warn(...)`
      # BEFORE the fallback deny-check below, which meant `warn()`'s own
      # `exit 0` terminated the script first and the deny-check was
      # unreachable dead code. Confirmed live: a plain
      # `http://169.254.169.254/...` request was allowed through (exit 0)
      # whenever python3 wasn't on PATH, while the hook's own warning text
      # claimed only a "degraded" mode, not a fully disabled one. Order is
      # now: run the real check first, and only reach the warning if the
      # check itself didn't already deny and exit.
      if printf '%s' "$HOST" | grep -qE \
        '^(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|::1|10\.[0-9]+\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|169\.254\.[0-9]+\.[0-9]+|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.[0-9]+\.[0-9]+)$'; then
        deny "Blocked [L1.5 Tool Validator]: WebFetch to private/loopback address '${HOST}' is blocked (SSRF guard, degraded mode). Bypass: YANA_TOOL_VALID_BYPASS=1"
      fi
      warn "⚠️  Tool Validator [L1.5]: python3 not found — WebFetch SSRF guard degraded to literal-hostname matching only (DNS rebinding and alternate IP encodings are NOT caught in this mode). Install python3 to restore full protection."
    fi

    # Metadata hostnames that are DNS names, not bare IPs — kept as an
    # explicit backstop alongside the resolution-based check above (which
    # already covers them once resolved) in case DNS is unreachable in a
    # given sandbox and getaddrinfo's failure mode above wasn't hit first.
    if printf '%s' "$HOST" | grep -qE '^(metadata\.google\.internal|metadata\.internal)$'; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch to cloud metadata endpoint '${HOST}' is blocked. Accessing instance metadata services can expose cloud credentials. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi
  fi
fi

exit 0
