#!/usr/bin/env bash
# Switch active AI engine adapter
# Usage: bash core/scripts/switch-engine.sh <claude|cursor|codex|antigravity|status>
set -euo pipefail

# Parse arguments: ENGINE is the first non-flag arg; --dry-run sets DRY_RUN=1
DRY_RUN=0
ENGINE=""
for _arg in "$@"; do
  case "$_arg" in
    --dry-run) DRY_RUN=1 ;;
    *)         [[ -z "$ENGINE" ]] && ENGINE="$_arg" ;;
  esac
done
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

usage() {
  echo "Usage: $0 [--dry-run] <engine>"
  echo ""
  echo "Engines:"
  echo "  claude   — default (no adapter needed, uses .claude/ hooks natively)"
  echo "  cursor   — activates .cursorrules + .cursor/rules/*.mdc"
  echo "  codex    — synchronizes Codex agents, skills, commands, and hooks"
  echo "  antigravity — generates .agent/rules/yana-ai.md (workspace rule, ≤12K chars)"
  echo "  status     — show which adapters are currently active"
  echo ""
  echo "Options:"
  echo "  --dry-run  — preview what would change without writing files"
  exit 1
}

[[ -z "$ENGINE" ]] && usage

# ── Structured audit metadata ─────────────────────────────────────────────────
# Derive operator and previous engine for structured engine_switch log entries.
# _FROM_ENGINE reads the last engine_switch entry from the audit log; falls back
# to "unknown" when the log is absent or uses the old free-form format.
_OPERATOR=$(git config user.name 2>/dev/null | tr ' ' '_' | tr -d '|"' || echo "unknown")
_AUDIT_LOG="${YANA_LOG_DIR:-core/memory/audit}/agent-actions.log"
_FROM_ENGINE="unknown"
if [[ -f "$_AUDIT_LOG" ]]; then
  _LAST_SWITCH=$(grep "| engine_switch |" "$_AUDIT_LOG" 2>/dev/null | tail -1 || true)
  if [[ -n "$_LAST_SWITCH" ]]; then
    _PARSED=$(printf '%s' "$_LAST_SWITCH" | grep -oE 'to_engine=[A-Za-z0-9_-]+' | cut -d= -f2 || true)
    [[ -n "$_PARSED" ]] && _FROM_ENGINE="$_PARSED"
  fi
fi

case "$ENGINE" in
  claude)
    echo -e "${GREEN}Claude Code (native) — no adapter needed.${NC}"

    # Log via secure-logger.sh if available
    LOGGER="core/scripts/secure-logger.sh"
    if [[ -x "$LOGGER" ]]; then
      bash "$LOGGER" engine_switch "to_engine=claude from_engine=$_FROM_ENGINE mode=hard-runtime operator=$_OPERATOR" 2>/dev/null || true
      bash "$LOGGER" advisory_gap_end "engine=claude from_engine=$_FROM_ENGINE" 2>/dev/null || true
    fi

    echo -e "${GREEN}✓ ADVISORY_GAP_END${NC}"
    echo "  Returning to Claude Code native — OS-level hooks active via .claude/settings.json."
    echo "  All tool calls are recorded in the Yana AI Merkle audit chain."
    echo ""
    echo "Hooks in core/hooks/ are enforced at runtime via .claude/settings.json"
    echo "Run: bash core/tests/hooks/run-hook-tests.sh to verify"
    ;;

  cursor)
    if [[ -f ".cursorrules" ]]; then
      echo -e "${GREEN}✓ .cursorrules present${NC} ($(wc -l < .cursorrules) lines)"
    else
      echo -e "${RED}✗ .cursorrules missing — regenerate:${NC}"
      echo "  bash core/scripts/switch-engine.sh cursor --regen"
    fi
    if [[ -d ".cursor/rules" ]]; then
      echo -e "${GREEN}✓ .cursor/rules/ present${NC} ($(ls .cursor/rules/*.mdc 2>/dev/null | wc -l) rules)"
    fi

    # ── Hard enforcement: inject safe-run proxy rule into Cursor ──────────────
    # _MDC_WRITTEN / _HOOK_FILE_WIRED / _HOOKS_JSON_WIRED track what ACTUALLY
    # happened in this run (not what was attempted) — the closing summary and
    # the audit log below both read these instead of assuming success, per a
    # code-auditor finding (54-bft-consensus-law.md review) that the old
    # unconditional "✓ REAL enforcement active" banner printed even when the
    # hook source was missing or jq was unavailable, directly under its own
    # correct ✗ error for the same failure.
    _MDC_WRITTEN=0
    _HOOK_FILE_WIRED=0
    _HOOKS_JSON_WIRED=0

    MDC=".cursor/rules/yana-ai-hard-enforcement.mdc"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      [[ -d ".cursor/rules" ]] || echo -e "${CYAN}[dry-run] Would create .cursor/rules/${NC}"
      [[ -f "$MDC" ]] && echo -e "${CYAN}[dry-run] Would backup $MDC before overwrite${NC}"
      echo -e "${CYAN}[dry-run] Would write $MDC (Yana AI hard enforcement rule)${NC}"
    else
    mkdir -p ".cursor/rules"

    # Backup before overwrite
    if [[ -f "$MDC" ]]; then
      BACKUP="${MDC}.bak.$(date +%Y%m%d_%H%M%S)"
      cp "$MDC" "$BACKUP"
      echo -e "${YELLOW}↩ Backup created:${NC} $BACKUP"
    fi

    cat > "$MDC" << 'CURSOREOF'
---
description: Yana AI Hard Enforcement — all bash commands must route through safe-run.sh
alwaysApply: true
---

# Yana AI Security Gate — Cursor Hard Enforcement

**MANDATORY:** Every bash/shell command you generate MUST be prefixed with the safe-run proxy:

```
bash core/scripts/safe-run.sh --engine cursor <your command here>
```

## Examples

❌ FORBIDDEN:
```bash
rm -rf dist/
git push --force
```

✅ REQUIRED:
```bash
bash core/scripts/safe-run.sh --engine cursor rm -rf dist/
bash core/scripts/safe-run.sh --engine cursor git push --force
```

## Why

Yana AI's L0–L5 gate stack screens every command for destructive patterns, LD_PRELOAD hijacks,
pipe-to-shell exploits, and elevated-risk operations before execution.

Cursor DOES have a native hook layer as of `.cursor/hooks.json` +
`.cursor/hooks/before-shell-execution.js`: every shell command you run is now
technically screened (not just prompt-advised) by `core/hooks/guard-destructive.sh`
before Cursor executes it — rm -rf, force-push, reset --hard, clean -f, direct push
to main/master, destructive SQL, and npm/yarn/pnpm publish are hard-blocked, no
matter what you write in your command.

That technical block covers a NARROWER pattern set than safe-run.sh's prefix screen —
LD_PRELOAD/DYLD hijacks, pipe-to-shell (curl|bash), chmod 777, dd/mkfs/fdisk are NOT
checked by the native hook. For those, the safe-run.sh prefix below remains the only
coverage that exists today:

```
bash core/scripts/safe-run.sh --engine cursor <your command here>
```

## Violations

Any command in the categories above executed without the safe-run proxy is a TIER-2
security violation. Log: /tmp/yana-ai-audit.log

Any command in guard-destructive.sh's category (rm -rf, force-push, etc.) submitted as a
native shell command is now blocked before it runs via Cursor's beforeShellExecution hook.
Cursor's MCP tool calls go through a separate event this hook does not cover — an MCP tool
that runs an equivalent destructive action is not screened by it, so the safe-run.sh prefix
above still matters for MCP-originated commands too.
CURSOREOF
    echo -e "${GREEN}✓ Hard enforcement rule written${NC}: $MDC"
    _MDC_WRITTEN=1
    fi  # end dry-run guard

    # ── Real hard enforcement: Cursor beforeShellExecution hook ────────────────
    # Thin translator only — core/hooks/guard-destructive.sh stays the single
    # source of truth for destructive-command detection (see
    # core/adapters/cursor/before-shell-execution.js's own header and
    # core/rules/54-bft-consensus-law.md). This wires the real technical block
    # Cursor's native hook API now supports, on top of the .mdc prompt guidance
    # written above (which still covers the broader pattern set the hook
    # doesn't check — see the corrected "Why" section in the .mdc itself).
    HOOK_SRC="core/adapters/cursor/before-shell-execution.js"
    HOOK_DEST=".cursor/hooks/before-shell-execution.js"
    HALT_HOOK_SRC="core/adapters/cursor/giamthi-halt-check.js"
    HALT_HOOK_DEST=".cursor/hooks/giamthi-halt-check.js"
    HOOKS_JSON=".cursor/hooks.json"

    _JQ_AVAILABLE=0
    command -v jq >/dev/null 2>&1 && _JQ_AVAILABLE=1

    if [[ ! -f "$HOOK_SRC" || ! -f "$HALT_HOOK_SRC" ]]; then
      [[ -f "$HOOK_SRC" ]] || echo -e "${RED}✗ $HOOK_SRC missing — cannot wire destructive-command enforcement.${NC}"
      [[ -f "$HALT_HOOK_SRC" ]] || echo -e "${RED}✗ $HALT_HOOK_SRC missing — cannot wire Giám thị halt enforcement.${NC}"
    elif [[ "$DRY_RUN" -eq 1 ]]; then
      [[ -d ".cursor/hooks" ]] || echo -e "${CYAN}[dry-run] Would create .cursor/hooks/${NC}"
      [[ -f "$HOOK_DEST" ]] && echo -e "${CYAN}[dry-run] Would backup $HOOK_DEST before overwrite${NC}"
      [[ -f "$HALT_HOOK_DEST" ]] && echo -e "${CYAN}[dry-run] Would backup $HALT_HOOK_DEST before overwrite${NC}"
      echo -e "${CYAN}[dry-run] Would copy $HOOK_SRC → $HOOK_DEST (chmod +x)${NC}"
      echo -e "${CYAN}[dry-run] Would copy $HALT_HOOK_SRC → $HALT_HOOK_DEST (chmod +x)${NC}"
      if [[ "$_JQ_AVAILABLE" -eq 1 ]]; then
        [[ -f "$HOOKS_JSON" ]] \
          && echo -e "${CYAN}[dry-run] Would merge shell guard plus cross-event halt entries into existing $HOOKS_JSON${NC}" \
          || echo -e "${CYAN}[dry-run] Would create $HOOKS_JSON${NC}"
      else
        echo -e "${RED}[dry-run] jq not found — $HOOKS_JSON would NOT be written; hook would not actually be wired.${NC}"
      fi
    else
      mkdir -p ".cursor/hooks"
      if [[ -f "$HOOK_DEST" ]]; then
        BACKUP="${HOOK_DEST}.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$HOOK_DEST" "$BACKUP"
        echo -e "${YELLOW}↩ Backup created:${NC} $BACKUP"
      fi
      cp "$HOOK_SRC" "$HOOK_DEST"
      chmod +x "$HOOK_DEST"
      if [[ -f "$HALT_HOOK_DEST" ]]; then
        BACKUP="${HALT_HOOK_DEST}.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$HALT_HOOK_DEST" "$BACKUP"
        echo -e "${YELLOW}↩ Backup created:${NC} $BACKUP"
      fi
      cp "$HALT_HOOK_SRC" "$HALT_HOOK_DEST"
      chmod +x "$HALT_HOOK_DEST"
      echo -e "${GREEN}✓ Real enforcement hooks written${NC}: $HOOK_DEST, $HALT_HOOK_DEST"
      _HOOK_FILE_WIRED=1

      # Merge (not overwrite) — hooks.json is general-purpose Cursor config a
      # user could have hand-edited for unrelated hooks (e.g. their own
      # afterFileEdit formatter), unlike the .mdc above, which Yana AI fully
      # owns.
      if [[ "$_JQ_AVAILABLE" -ne 1 ]]; then
        echo -e "${RED}✗ jq not found — cannot safely merge $HOOKS_JSON.${NC}"
        echo "  Manually add both entries under .hooks.beforeShellExecution:"
        echo '  {"command":".cursor/hooks/giamthi-halt-check.js","timeout":30,"failClosed":true}'
        echo '  {"command":".cursor/hooks/before-shell-execution.js","timeout":30,"failClosed":true}'
        echo "  Also add the giamthi-halt-check.js entry under beforeMCPExecution,"
        echo "  beforeReadFile, and beforeSubmitPrompt."
        echo -e "${YELLOW}  Until then, the hook file is on disk but Cursor has nothing telling it to run it.${NC}"
      else
        NEW_ENTRY='{"command":".cursor/hooks/before-shell-execution.js","timeout":30,"failClosed":true}'
        HALT_ENTRY='{"command":".cursor/hooks/giamthi-halt-check.js","timeout":30,"failClosed":true}'
        if [[ -f "$HOOKS_JSON" ]]; then
          BACKUP="${HOOKS_JSON}.bak.$(date +%Y%m%d_%H%M%S)"
          cp "$HOOKS_JSON" "$BACKUP"
          echo -e "${YELLOW}↩ Backup created:${NC} $BACKUP"
          MERGED=$(jq --argjson entry "$NEW_ENTRY" --argjson halt "$HALT_ENTRY" '
            .version //= 1
            | .hooks //= {}
            | reduce ["beforeShellExecution", "beforeMCPExecution", "beforeReadFile", "beforeSubmitPrompt"][] as $event (.;
                .hooks[$event] //= []
                | .hooks[$event] |= (map(select(.command != $halt.command)) + [$halt])
              )
            | .hooks.beforeShellExecution
                |= (map(select(.command != $entry.command)) + [$entry])
          ' "$HOOKS_JSON")
          printf '%s\n' "$MERGED" > "$HOOKS_JSON"
        else
          jq -n --argjson entry "$NEW_ENTRY" --argjson halt "$HALT_ENTRY" '
            {version: 1, hooks: {}}
            | reduce ["beforeShellExecution", "beforeMCPExecution", "beforeReadFile", "beforeSubmitPrompt"][] as $event (.;
                .hooks[$event] = [$halt]
              )
            | .hooks.beforeShellExecution += [$entry]
          ' > "$HOOKS_JSON"
        fi
        echo -e "${GREEN}✓ Wired${NC}: $HOOKS_JSON → shell guard + cross-event Giám thị halt"
        _HOOKS_JSON_WIRED=1
      fi
    fi  # end real-hook dry-run guard

    # One unified, unconditional log entry reflecting what ACTUALLY happened
    # (mdc_written / hook_wired / hooks_json_wired each independently 0 or 1)
    # — fires every invocation, dry-run or not, so a partial/failed run still
    # leaves an audit trail instead of silently producing no log line at all.
    LOGGER="core/scripts/secure-logger.sh"
    if [[ -x "$LOGGER" ]]; then
      bash "$LOGGER" engine_switch "to_engine=cursor from_engine=$_FROM_ENGINE mode=hard-runtime dry_run=$DRY_RUN mdc_written=$_MDC_WRITTEN hook_wired=$_HOOK_FILE_WIRED hooks_json_wired=$_HOOKS_JSON_WIRED operator=$_OPERATOR" 2>/dev/null || true
    fi

    echo ""
    echo -e "${CYAN}Cursor picks up these files automatically.${NC}"
    if [[ "$_HOOK_FILE_WIRED" -eq 1 && "$_HOOKS_JSON_WIRED" -eq 1 ]]; then
      echo -e "${GREEN}✓ REAL enforcement active${NC} (via Cursor's beforeShellExecution hook):"
      echo "  Every native shell command Cursor runs is now technically screened by"
      echo "  core/hooks/guard-destructive.sh — rm -rf, git push --force,"
      echo "  git reset --hard, git clean -f, direct push to main/master,"
      echo "  destructive SQL (DROP/TRUNCATE), npm/yarn/pnpm publish."
      echo "  GIAMTHI_HALT.lock blocks new shell, MCP, read-file, and prompt-submit"
      echo "  events through the shared .claude/state authority."
      echo -e "${YELLOW}  Not covered by this hook${NC}:"
      echo "  (1) safe-run.sh's broader, prompt-only set — LD_PRELOAD/DYLD hijacks,"
      echo "      pipe-to-shell (curl|bash), chmod 777, dd/mkfs/fdisk."
      echo "  (2) Cursor's MCP tool calls — a separate event this hook doesn't cover."
      echo "  For both, the .mdc's safe-run.sh prefix guidance is still the only"
      echo "  coverage that exists today."
    elif [[ "$DRY_RUN" -eq 1 ]]; then
      echo -e "${CYAN}[dry-run] No files were written — re-run without --dry-run to activate real enforcement.${NC}"
    else
      echo -e "${YELLOW}⚠ Real enforcement is NOT fully active${NC} — see the ✗ message(s) above for what's missing."
      echo "  Until resolved, Cursor has no technical block on destructive commands;"
      echo "  only the .mdc's prompt-based guidance (safe-run.sh prefix) applies."
    fi
    ;;

  codex)
    ADAPTER="adapters/codex.md"
    DEST="AGENTS.md"
    if [[ ! -f "$ADAPTER" ]]; then
      echo -e "${RED}✗ $ADAPTER missing${NC}"
      exit 1
    fi

    if [[ -f "$DEST" ]]; then
      echo -e "${YELLOW}↩ $DEST already exists${NC} ($(wc -l < "$DEST") lines) — not overwriting."
    elif [[ "$DRY_RUN" -eq 1 ]]; then
      echo -e "${CYAN}[dry-run] Would copy $ADAPTER → $DEST${NC}"
    else
      cp "$ADAPTER" "$DEST"
      echo -e "${GREEN}✓ Generated:${NC} $DEST ($(wc -l < "$DEST") lines)"
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo -e "${CYAN}[dry-run] Would synchronize core/agents → .codex/agents${NC}"
      echo -e "${CYAN}[dry-run] Would synchronize core/skills → .agents/skills${NC}"
      echo -e "${CYAN}[dry-run] Would adapt core/commands → .agents/skills/yana-command-*${NC}"
      echo -e "${CYAN}[dry-run] Would synchronize core/hooks → .codex/hooks${NC}"
    else
      python3 core/scripts/sync_codex.py --target .
      python3 core/scripts/sync_codex.py --check --target .

      LOGGER="core/scripts/secure-logger.sh"
      if [[ -x "$LOGGER" ]]; then
        bash "$LOGGER" engine_switch "to_engine=codex from_engine=$_FROM_ENGINE mode=project-hooks generated_file=.codex/config.toml operator=$_OPERATOR" 2>/dev/null || true
        bash "$LOGGER" advisory_gap_end "engine=codex from_engine=$_FROM_ENGINE" 2>/dev/null || true
      fi
    fi

    echo ""
    echo -e "${GREEN}Codex project support active.${NC}"
    echo "  Guidance: AGENTS.md"
    echo "  Agents:   .codex/agents/*.toml"
    echo "  Skills:   .agents/skills/*/SKILL.md"
    echo "  Commands: \$yana-command-<name>"
    echo "  Hooks:    .codex/hooks.json"
    ;;

  antigravity)
    ADAPTER="adapters/antigravity.md"
    DEST=".agent/rules/yana-ai.md"
    READER="Google Antigravity"
    if [[ ! -f "$ADAPTER" ]]; then
      echo -e "${RED}✗ $ADAPTER missing${NC}"
      exit 1
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
      [[ -f "$DEST" ]] && echo -e "${CYAN}[dry-run] Would backup $DEST before overwrite${NC}"
      echo -e "${CYAN}[dry-run] Would copy $ADAPTER → $DEST${NC}"
    else
      mkdir -p "$(dirname "$DEST")"
      if [[ -f "$DEST" ]]; then
        BACKUP="${DEST}.bak.$(date +%Y%m%d_%H%M%S)"
        cp "$DEST" "$BACKUP"
        echo -e "${YELLOW}↩ Backup created:${NC} $BACKUP"
      fi
      cp "$ADAPTER" "$DEST"
      echo -e "${GREEN}✓ Generated:${NC} $DEST ($(wc -l < "$DEST") lines)"

      LOGGER="core/scripts/secure-logger.sh"
      if [[ -x "$LOGGER" ]]; then
        bash "$LOGGER" engine_switch "to_engine=$ENGINE from_engine=$_FROM_ENGINE mode=advisory source_adapter=$ADAPTER generated_file=$DEST operator=$_OPERATOR" 2>/dev/null || true
        bash "$LOGGER" advisory_gap_start "engine=$ENGINE from_engine=$_FROM_ENGINE" 2>/dev/null || true
      fi
    fi

    echo ""
    echo -e "${YELLOW}Advisory gap active.${NC} $DEST loaded by $READER natively."
    echo "  Yana AI safety hooks are NOT enforced at the OS level in $READER."
    echo "  Rules are advisory via the generated rules file only."
    echo ""
    echo "  Key constraints active:"
    echo "    • No rm -rf, no force push, no pipe-to-shell, no eval dynamic code"
    echo "    • Evidence required before completion claims"
    echo "    • Surgical changes only"
    ;;

  status)
    echo "=== Yana AI Engine Adapter Status ==="
    echo ""
    [[ -f ".codex/config.toml" && -f ".codex/hooks.json" ]] \
      && echo -e "  ${GREEN}✓${NC} Codex     project config + hooks" \
      || echo -e "  ${YELLOW}✗${NC} Codex     project config or hooks missing"
    [[ -d ".codex/agents" ]] \
      && echo -e "  ${GREEN}✓${NC} Codex     .codex/agents/ ($(find .codex/agents -maxdepth 1 -name '*.toml' | wc -l | tr -d ' ') agents)" \
      || echo -e "  ${YELLOW}✗${NC} Codex     .codex/agents/ missing"
    [[ -d ".agents/skills" ]] \
      && echo -e "  ${GREEN}✓${NC} Codex     .agents/skills/ ($(find .agents/skills -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ') skills)" \
      || echo -e "  ${YELLOW}✗${NC} Codex     .agents/skills/ missing"
    [[ -f ".cursorrules" ]] \
      && echo -e "  ${GREEN}✓${NC} Cursor    .cursorrules ($(wc -l < .cursorrules) lines)" \
      || echo -e "  ${YELLOW}✗${NC} Cursor    .cursorrules missing"
    [[ -d ".cursor/rules" ]] \
      && echo -e "  ${GREEN}✓${NC} Cursor    .cursor/rules/ ($(ls .cursor/rules/*.mdc 2>/dev/null | wc -l) .mdc files)" \
      || echo -e "  ${YELLOW}✗${NC} Cursor    .cursor/rules/ missing"
    [[ -f ".cursor/hooks.json" ]] \
      && echo -e "  ${GREEN}✓${NC} Cursor    .cursor/hooks.json (real beforeShellExecution enforcement)" \
      || echo -e "  ${YELLOW}✗${NC} Cursor    .cursor/hooks.json missing"
    [[ -f ".agent/rules/yana-ai.md" ]] \
      && echo -e "  ${GREEN}✓${NC} Antigrav  .agent/rules/yana-ai.md" \
      || echo -e "  ${YELLOW}✗${NC} Antigrav  .agent/rules/yana-ai.md missing"
    echo ""
    echo -e "  ${GREEN}✓${NC} Claude    native (hooks in core/hooks/)"
    ;;

  *)
    echo -e "${RED}Unknown engine: $ENGINE${NC}"
    usage
    ;;
esac
