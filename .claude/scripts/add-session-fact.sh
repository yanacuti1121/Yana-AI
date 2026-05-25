#!/usr/bin/env bash
# Non-interactive script — Add one L2 Session Memory fact.
#
# Designed for fast agent writes during a session.
# All required fields passed as arguments — no prompts.
#
# Usage:
#   bash core/scripts/add-session-fact.sh --id <id> --statement "<statement>" [OPTIONS]
#
# Required:
#   --id         Short slug (e.g. "s-auth-decision")
#   --statement  One sentence describing the fact
#
# Optional:
#   --source     Default: "agent" (other values: "user:HH:MM", "inference")
#   --tags       Comma-separated tags (e.g. "auth,api-design")
#   --evidence   Path or quoted excerpt
#   --body       Additional context (single line)
#
# Reference: memory/L2_session/SCHEMA.md

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/memory/L2_session"

if [[ ! -d "$L2_DIR" ]]; then
  echo "Error: $L2_DIR does not exist. Run from yamtam-engine root." >&2
  exit 1
fi

# ── Parse args ────────────────────────────────────────────────────────────────
id=""
statement=""
source_val="agent"
tags_raw=""
evidence=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)        shift; id="$1" ;;
    --statement) shift; statement="$1" ;;
    --source)    shift; source_val="$1" ;;
    --tags)      shift; tags_raw="$1" ;;
    --evidence)  shift; evidence="$1" ;;
    --body)      shift; body="$1" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ -z "$id" || -z "$statement" ]]; then
  echo "Usage: add-session-fact.sh --id <id> --statement \"<statement>\" [--source ...] [--tags ...] [--evidence ...] [--body ...]" >&2
  exit 1
fi

# Sanitise id
id=$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
if [[ -z "$id" ]]; then
  echo "Error: id cannot be empty after sanitisation." >&2
  exit 1
fi

# Safety check: no obvious secret patterns
if printf '%s' "$statement" | grep -qiE '(password|secret|token|api[_-]?key|private[_-]?key|credential)'; then
  echo "Error: Statement appears to contain sensitive data. L2 facts must not store secrets." >&2
  exit 1
fi

FACT_FILE="$L2_DIR/$id.md"
if [[ -f "$FACT_FILE" ]]; then
  echo "Error: Session fact already exists: $FACT_FILE" >&2
  exit 1
fi

# ── Build frontmatter ─────────────────────────────────────────────────────────
frontmatter="---
id: $id
statement: $(printf '%s' "$statement" | head -c 500)
source: $source_val"

if [[ -n "$tags_raw" ]]; then
  tags_yaml=$(printf '%s' "$tags_raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[[:space:]]*,[[:space:]]*/,/g; s/^[[:space:]]*//; s/[[:space:]]*$//' \
    | awk -F',' 'BEGIN{printf "["} {for(i=1;i<=NF;i++){if(i>1)printf ", "; printf $i}} END{print "]"}')
  frontmatter="$frontmatter
tags: $tags_yaml"
fi

if [[ -n "$evidence" ]]; then
  frontmatter="$frontmatter
evidence: $(printf '%s' "$evidence" | head -c 300)"
fi

frontmatter="$frontmatter
---"

# ── Write fact file ───────────────────────────────────────────────────────────
{
  printf '%s\n' "$frontmatter"
  echo ""
  if [[ -n "$body" ]]; then
    printf '%s\n' "$body"
  fi
} > "$FACT_FILE"

echo "Session fact '$id' written to $FACT_FILE"
