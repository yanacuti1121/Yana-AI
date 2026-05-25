# YAMTAM ENGINE — Shell Sanitization Law
# Source: koalaman/shellcheck SC2086/SC2091/SC2094/injection rules (GPL-3.0)
# github.com/koalaman/shellcheck
# Gate: Action Gate L2 (pre-execution shell validation)

**Status:** Active  
**Tier:** TIER 1 — SECURITY  
**Scope:** All shell scripts written or executed by agents

---

## Core Rule

Every variable in a shell script MUST be double-quoted.
Every user-supplied value MUST pass through `sanitize_arg()` before use in commands.
`eval` with dynamic content is BANNED without a documented exception.

---

## Mandatory Quoting (shellcheck SC2086)

```bash
# ❌ BANNED — word splitting + glob expansion
rm $FILE
cp $SRC $DST
git commit -m $MSG

# ✅ REQUIRED — always double-quote
rm "$FILE"
cp "$SRC" "$DST"
git commit -m "$MSG"
```

Array expansion must use `"${array[@]}"`, never `$array` or `${array[*]}`.

---

## Operator Injection Defense

Agents MUST strip or reject these characters from any user/external input
before using in shell context:

```bash
sanitize_arg() {
  local input="$1"
  # Strip shell metacharacters: ; & | ` $ ( ) { } [ ] < > ! \n \r
  printf '%s' "$input" | tr -d ';&|`$(){}<>!\n\r' | head -c 512
}

# Usage
SAFE_MSG=$(sanitize_arg "$USER_INPUT")
git commit -m "$SAFE_MSG"
```

**Banned characters in shell arguments (unless explicitly escaped):**

```
;   — command separator     → enables ; rm -rf /
&&  — AND chain             → enables cmd && malicious
||  — OR chain              → enables fail || malicious
|   — pipe                  → enables cmd | bash
`   — backtick subshell     → enables `id`
$() — subshell              → enables $(cat /etc/passwd)
>   — redirect              → enables > /etc/crontab
<   — input redirect
!   — history expansion     → enables !rm
```

---

## eval Rules (shellcheck SC2091)

```bash
# ❌ BANNED — eval with dynamic/user content
eval "$USER_CMD"
eval "$(curl http://...)"
eval "$DYNAMIC_FUNCTION_NAME"

# ✅ ALLOWED — eval with static, hardcoded content only
eval "$(declare -p KNOWN_ARRAY)"  # known variable expansion only
```

If eval is genuinely required:
1. Document WHY in a comment above the line
2. The evaluated string MUST be a compile-time constant or come from a trusted internal source
3. Log via `secure-logger.sh shell_eval_used "<script>:<line>"`

---

## Command Construction Rules

```bash
# ❌ BANNED — string concatenation for commands
CMD="git $SUBCMD $FLAGS"
eval "$CMD"

# ✅ REQUIRED — array-based command construction
CMD=("git" "$SUBCMD")
[[ -n "$FLAGS" ]] && CMD+=("$FLAGS")
"${CMD[@]}"
```

---

## Safe Execution Wrapper Pattern

All agent-generated scripts MUST open with:

```bash
#!/usr/bin/env bash
set -euo pipefail   # -e exit on error, -u unset var error, -o pipefail
IFS=$'\n\t'         # safe IFS — prevents word splitting on spaces
```

`set -u` catches unquoted empty variables before they cause harm.

---

## Violation Response

```
[yamtam/shell-sanitize] BLOCKED — unsafe shell pattern detected
  File    : <path>:<line>
  Pattern : <SC code> — <description>
  Gate    : L2
  Fix     : Quote the variable / use sanitize_arg() / replace eval
```
