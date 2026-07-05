#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Block destructive shell commands (rm -rf, kill, etc.)
# Last Reviewed: 2026-05-19
# PreToolUse hook — blocks destructive shell commands before they execute.
# Reads the tool input JSON from stdin, inspects the command, and denies
# patterns that are irreversible or dangerous in a shared codebase.
#
# Exit behaviour:
#   exit 0          — allow the command
#   JSON + exit 2   — block the command and show the reason to Claude
#
# KNOWN LIMITATION (2026-07-05, after 4 rounds of adversarial review the
# same day — see README.md's "Known Limitations" section): this is a
# command-string guard, not a full shell parser. It normalizes and blocks
# whole-token quoting ("...", '...', $'...'), backslash-escaping, ${IFS}-
# style variable splicing, and brace expansion adjacent to a git/rm
# invocation — but it does NOT handle mid-token quote-splice
# concatenation, where quoted and unquoted fragments alternate within a
# single word with no separating whitespace (e.g. `--forc"e"`, which a
# real shell resolves to `--force` but this guard still sees as two
# distinct pieces). Closing that gap needs character-run quote-state
# parsing, not another token-comparison patch — tracked as a longer-term
# design question rather than chased as a fifth quick-fix round.

set -euo pipefail

# ── Native Rust fast path (audit 2026-06-21) ─────────────────────────────────
# If yana-rt is installed and on PATH, delegate to the in-process Rust port:
# no jq dependency, no subprocess-per-call cost. `exec` hands stdin/stdout
# straight through and the script's exit code becomes yana-rt's exit code —
# tested byte-for-byte identical to the bash logic below (same 7 patterns,
# same deny-reason text; see src/guard/mod.rs::cmd_destructive). Falls
# through unchanged to the jq-based logic if yana-rt isn't found, so this
# hook keeps working exactly as before on a machine without it installed.
if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard destructive
fi

# ── Dependency guard ─────────────────────────────────────────────────────────
# This hook requires `jq` to parse the tool-input JSON. If jq is missing we
# FAIL CLOSED: block the command so the user installs jq rather than silently
# letting destructive commands through. (Previous behaviour crashed, which
# Claude Code interprets as "hook didn't block" — effectively disabling the
# guard. That would be very bad for `rm -rf`, `DROP TABLE`, force-push, etc.)
if ! command -v jq >/dev/null 2>&1; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: the destructive-command guard requires `jq` but it is not installed. Install jq (macOS: `brew install jq` · Debian/Ubuntu: `sudo apt-get install jq` · Windows: `winget install jqlang.jq`) and retry. This fails closed so that destructive shell commands cannot slip past a broken guard."
  }
}
EOF
  exit 2
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

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

# SECURITY FIX (2026-07-04, round 3 — caught by security-auditor adversarial
# review of round 2): every token comparison in this file (`short_flag_in_
# token`, `git_subcommand`, `git_segment_targets`, the `--force*` glob
# checks) does whitespace word-splitting on a raw string with no quote
# removal, backslash de-escaping, or variable expansion — a real shell does
# all three before building argv. Demonstrated live bypasses that reach
# real git/rm invocations while producing a DIFFERENT (non-matching) token
# here: `git "push" --force ...`, `git \push --force ...`,
# `git push "--force" ...`, `rm "-rf" /path`, and `git${IFS}push` /
# `rm${IFS}-rf` (a single opaque token here; real shells expand $IFS to a
# space before tokenizing, so the actual command run is `git push` / `rm -rf`).
#
# Fix, in two parts:
#  1. strip_tok() below removes one matching pair of leading/trailing
#     quote characters and un-escapes backslashes, applied at every
#     comparison point — closes the quote/backslash bypasses.
#  2. A dedicated check further down denies outright on the `${IFS}`-style
#     shape (a variable reference glued directly between two letters, no
#     separating whitespace) — this shape has no legitimate use in an
#     ordinary command, so failing closed on it costs nothing real.
# This is still not a full shell parser — nested quoting, command
# substitution, arithmetic expansion, and other expansion forms are out of
# scope for this pass; tracked as a longer-term design question, not
# silently claimed as closed by this fix.
strip_tok() {
  local t="$1"
  # SECURITY FIX (round 4 — caught by security-auditor adversarial review of
  # round 3): $'...' (ANSI-C quoting, e.g. `git $'push' --force ...`) wasn't
  # recognized as a quote form at all — only a literal leading "/' was
  # checked. Strip it first, before the generic backslash/quote handling
  # below (which would otherwise leave the leading `$'` in place).
  if [[ "$t" == \$\'*\' && ${#t} -ge 3 ]]; then
    t="${t#\$\'}"; t="${t%\'}"
  fi
  t="${t//\\/}"                                  # unescape: \X -> X (all backslashes)
  if [[ "$t" == \"*\" && ${#t} -ge 2 ]]; then
    t="${t#\"}"; t="${t%\"}"
  elif [[ "$t" == \'*\' && ${#t} -ge 2 ]]; then
    t="${t#\'}"; t="${t%\'}"
  fi
  printf '%s' "$t"
}

# ── Flag-aware detection (2026-07-08 audit fix) ──────────────────────────────
# The previous version used a single regex per command
# (`-[a-zA-Z]*r[a-zA-Z]*f`) that only matched flags written together as one
# combined short option. Verified bypasses that slipped through it:
#   rm --recursive --force .      rm -r -f .           git push -uf origin main
#   git clean -df
# All four are functionally identical to the blocked forms — only the flag
# spelling differs. Fixed by tokenizing the command and checking, per
# chain-segment, whether recursive/force semantics are present in ANY form
# (long, combined-short, separated-short, or mixed with other short flags),
# rather than requiring one specific spelling. This is still substring/token
# based, not a full shell parser — it does not claim to catch every possible
# obfuscation, only the concrete spelling variants above.

# Split a command line on chain/pipe operators (; && || |) so flags from one
# command in a chain don't leak into checks for a different command.
split_segments() {
  printf '%s' "$1" | sed -E 's/(;|&&|\|\||\|)/\n/g'
}

# True if $2 (a single flag letter, e.g. f) is present in token $1, whether
# as a combined short cluster (-rf, -vrf) or matched via case-insensitive
# compare for rm's -R/-r alias.
short_flag_in_token() {
  local tok ch="$2"
  tok="$(strip_tok "$1")"
  [[ "$tok" == --* ]] && return 1
  [[ "$tok" == -* ]] || return 1
  local chars="${tok#-}"
  [[ -n "$chars" && "$chars" =~ ^[A-Za-z]+$ ]] || return 1
  local lower_chars lower_ch
  lower_chars=$(printf '%s' "$chars" | tr '[:upper:]' '[:lower:]')
  lower_ch=$(printf '%s' "$ch" | tr '[:upper:]' '[:lower:]')
  [[ "$lower_chars" == *"$lower_ch"* ]]
}

# rm invocation with BOTH recursive and force semantics present, in any
# spelling — this is what makes rm irreversible+silent, not either flag alone.
is_rm_rf() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    local in_rm=0 has_r=0 has_f=0 tok raw
    for raw in $segment; do
      tok="$(strip_tok "$raw")"
      if [[ $in_rm -eq 0 ]]; then
        [[ "$tok" == "rm" || "$tok" == */rm ]] && in_rm=1
        continue
      fi
      case "$tok" in
        --recursive|--recursive=*) has_r=1 ;;
        --force|--force=*)         has_f=1 ;;
      esac
      short_flag_in_token "$tok" r && has_r=1
      short_flag_in_token "$tok" f && has_f=1
    done
    [[ $has_r -eq 1 && $has_f -eq 1 ]] && return 0
  done < <(split_segments "$cmd")
  return 1
}

# ── git subcommand detection (2026-07-04 audit fix) ──────────────────────────
# SECURITY FIX: every check below used to test `[[ "$segment" =~
# git[[:space:]]+push ]]` — i.e. "git" immediately followed by whitespace
# then "push". That's only true when nothing sits between them. Any git
# global option before the subcommand — `git -C /path push`, `git
# --git-dir=/path push`, `git -c user.name=x push` — inserts a token there
# and the regex silently stops matching, so is_git_push_force(),
# is_git_clean_force(), the `git reset --hard` check, and the direct-
# push-to-main/master check were ALL bypassable by any real, ordinary git
# invocation that happens to pass a global flag first (not just a crafted
# evasion). Confirmed live: `git push --force origin X` was blocked,
# `git -C /path push --force origin X` was not (verified in a disposable
# /tmp bare repo, no real remote touched). Same regex-adjacency flaw
# applies to `is_rm_rf`'s "rm ... segment" scan already being token-based
# (unaffected) but every OTHER check here was still string-adjacency
# based specifically for the git subcommand name.
#
# Fix: find the actual git subcommand by tokenizing the segment and
# skipping over "git" plus any global options that precede it — not by
# requiring them to be textually adjacent. This still isn't a full git
# CLI parser (it doesn't know every global flag git has), but it covers
# the realistic ones and, more importantly, changes the failure mode:
# an option this doesn't recognize is treated as "not a flag" and
# short-circuits subcommand detection to nothing (fail closed to "not
# sure this is a push", which the specific-pattern checks below then
# re-verify by scanning for --force independently anyway) rather than
# silently deciding "no subcommand flags here, so no git command at all."
_GIT_GLOBAL_OPTS_WITH_ARG=" -C -c --git-dir --work-tree --namespace --exec-path "

# Prints the git subcommand of $1 (e.g. "push", "clean", "reset") to stdout
# and returns 0, skipping "git" itself and any global options — with or
# without a separate argument token — that precede it. Returns 1 (no
# output) if $1 isn't a git invocation at all.
git_subcommand() {
  local segment="$1" tok raw found_git=0 skip_next=0
  for raw in $segment; do
    tok="$(strip_tok "$raw")"
    if [[ $skip_next -eq 1 ]]; then
      skip_next=0
      continue
    fi
    if [[ $found_git -eq 0 ]]; then
      if [[ "$tok" == "git" || "$tok" == */git ]]; then
        found_git=1
      fi
      continue
    fi
    case "$tok" in
      --*=*) continue ;;   # --opt=value — self-contained, one token
      -*)
        [[ "$_GIT_GLOBAL_OPTS_WITH_ARG" == *" $tok "* ]] && skip_next=1
        continue
        ;;
      *)
        echo "$tok"
        return 0
        ;;
    esac
  done
  return 1
}

# SECURITY FIX (2026-07-04, round 2 — caught by code-auditor + security-
# auditor review of the git_subcommand() fix above): every check below
# used to gate its ENTIRE force/hard/main scan on `git_subcommand()`
# returning an exact match first (`[[ "$(git_subcommand ...)" == "push" ]]
# || continue`). git_subcommand() only recognizes a fixed list of global
# options that take a separate argument (_GIT_GLOBAL_OPTS_WITH_ARG). Any
# OTHER such option — confirmed live with `--super-prefix <path>`, which
# isn't in that list — makes git_subcommand() misread the option's own
# argument as the subcommand, return the wrong thing, and `continue` past
# the segment entirely BEFORE the force-flag scan ever runs. So `git
# --super-prefix /x push --force origin main` reopened the exact bypass
# class this file's previous fix (see git_subcommand() above) was written
# to close — just through a different, unlisted global option. This is
# not a hypothetical: reproduced with `--super-prefix` directly.
#
# Fix: don't let subcommand *resolution* gate the scan. git_segment_targets
# prefers git_subcommand()'s precise answer when it resolves cleanly, but
# if resolution comes back empty (unrecognized global option confused it),
# falls back to checking whether the wanted subcommand appears as a bare
# token anywhere after a genuine `git` invocation — broader, and it could
# theoretically over-match (e.g. "push" appearing inside a commit message
# string in the same segment), but for a destructive-command guard an
# occasional false "please confirm" is the correct failure direction; a
# missed force-push is not.
git_segment_targets() {
  local segment="$1" want="$2" tok raw found_git=0
  [[ "$(git_subcommand "$segment")" == "$want" ]] && return 0
  # BUG in the first attempt at this fix: gated the fallback below on
  # `git_subcommand()` having returned empty. It doesn't return empty for
  # an unrecognized global option — it confidently returns that option's
  # OWN ARGUMENT as if it were the subcommand (e.g. for `--super-prefix
  # /tmp/x push ...`, it returns "/tmp/x", not ""), so the old "only
  # fall back when resolved=='' " gate never actually triggered and the
  # bypass this was meant to close reproduced identically. Verified by
  # re-running the exact --super-prefix case after the first attempt —
  # still exit 0. Fix: always run the broader bare-token fallback as an
  # OR, not conditioned on what git_subcommand() returned.
  for raw in $segment; do
    tok="$(strip_tok "$raw")"
    if [[ $found_git -eq 0 ]]; then
      [[ "$tok" == "git" || "$tok" == */git ]] && found_git=1
      continue
    fi
    [[ "$tok" == "$want" ]] && return 0
  done
  return 1
}

# git push with force semantics (any spelling) — includes --force-with-lease
# on purpose, matching the original rule's conservative intent.
is_git_push_force() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    git_segment_targets "$segment" "push" || continue
    local tok raw
    for raw in $segment; do
      tok="$(strip_tok "$raw")"
      [[ "$tok" == --force* ]] && return 0
      short_flag_in_token "$raw" f && return 0
    done
  done < <(split_segments "$cmd")
  return 1
}

# git clean with force semantics (any spelling/order).
is_git_clean_force() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    git_segment_targets "$segment" "clean" || continue
    local tok raw
    for raw in $segment; do
      tok="$(strip_tok "$raw")"
      [[ "$tok" == --force* ]] && return 0
      short_flag_in_token "$raw" f && return 0
    done
  done < <(split_segments "$cmd")
  return 1
}

# git push targeting main/master directly (any global-option prefix).
is_git_push_to_main() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    git_segment_targets "$segment" "push" || continue
    echo "$segment" | grep -qE '\s(origin\s+)?(main|master)\b' && return 0
  done < <(split_segments "$cmd")
  return 1
}

# git reset --hard (any global-option prefix).
is_git_reset_hard() {
  local cmd="$1" segment
  while IFS= read -r segment || [[ -n "$segment" ]]; do
    git_segment_targets "$segment" "reset" || continue
    echo "$segment" | grep -qE '\-\-hard\b' && return 0
  done < <(split_segments "$cmd")
  return 1
}

# ── Suspicious variable-splice detection (round 3 fix, part 2) ──────────────
# `git${IFS}push` / `rm${IFS}-rf` are each ONE opaque token to every check
# above (no whitespace for `for tok in $segment` to split on) — a real
# shell expands $IFS before tokenizing, so the actual command executed is
# `git push` / `rm -rf`. Detecting shell expansion in general isn't
# tractable here, but this specific shape — a $VAR/${VAR} reference glued
# directly between two letters with no separating whitespace — has no
# legitimate use in an ordinary command (normal variable use always has
# whitespace, a path separator, or an operator on at least one side) and
# is exactly the shape that defeats whitespace-based tokenization. Deny
# outright rather than try to resolve what it expands to.
# Scoped to commands that also mention git/rm — an unrelated command with
# an adjacent-letter variable splice (rare, but possible in ordinary
# scripting) isn't this guard's concern; only the combination is denied.
if echo "$COMMAND" | grep -qE '\b(git|rm)\b' && \
   echo "$COMMAND" | grep -qE '[A-Za-z]\$\{?[A-Za-z_][A-Za-z0-9_]*\}?[A-Za-z]'; then
  deny "Blocked: command contains a variable reference glued directly between two letters (e.g. word\${VAR}word) with no separating whitespace, alongside a git/rm invocation. This guard cannot safely verify commands using this pattern. Run the command without adjacent-letter variable splicing, or ask the human to confirm."
fi

# ── Suspicious brace-expansion detection (round 4 fix) ───────────────────────
# `rm -{rf,} /path` expands (before this guard ever sees it) into TWO
# separate real arguments, `-rf` and `-`, i.e. the actual command executed
# is `rm -rf - /path` — a genuine recursive-force delete. Brace expansion
# is a distinct pre-tokenizing expansion phase (not a quoting/escaping
# issue strip_tok() could fix), so implementing it here would mean
# reimplementing a piece of bash's own expansion algorithm. Following the
# same precedent as the ${IFS}-splice check above: deny outright on the
# shape (a comma-containing {...} adjacent to a git/rm invocation) rather
# than attempt to resolve what it expands to.
if echo "$COMMAND" | grep -qE '\b(git|rm)\b' && \
   echo "$COMMAND" | grep -qE '\{[^{}]*,[^{}]*\}'; then
  deny "Blocked: command contains a brace-expansion pattern (e.g. {a,b}) alongside a git/rm invocation. This guard cannot safely verify commands using this pattern — brace expansion generates new arguments before any guard sees them. Run the command without brace expansion, or ask the human to confirm."
fi

# ── Destructive filesystem operations ────────────────────────────────────────
if is_rm_rf "$COMMAND"; then
  deny "Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first."
fi

# ── Dangerous git operations ──────────────────────────────────────────────────
if is_git_push_force "$COMMAND"; then
  deny "Blocked: 'git push --force' (any flag spelling) is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history."
fi

if is_git_reset_hard "$COMMAND"; then
  deny "Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting."
fi

if is_git_clean_force "$COMMAND"; then
  deny "Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked files. Ask the human to confirm before running this."
fi

# Direct pushes to main/master are handled by branch protection, but block at hook level too.
if is_git_push_to_main "$COMMAND"; then
  deny "Blocked: direct push to main/master. Create a feature branch and open a PR instead."
fi

# ── Destructive SQL operations ────────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b'; then
  deny "Blocked: destructive SQL (DROP TABLE / TRUNCATE) detected. Database migrations must be reversible. Use ALTER/soft-delete patterns and ask the human to confirm schema drops."
fi

# ── Dangerous package operations ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'npm\s+publish|yarn\s+publish|pnpm\s+publish'; then
  deny "Blocked: publishing to npm requires explicit human approval. Ask the human to run this command manually."
fi

# Allow everything else
exit 0
