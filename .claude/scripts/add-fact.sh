#!/usr/bin/env bash
# Interactive script — Add one L1 Atomic Memory fact.
#
# Prompts the user for each required field, writes a fact file to
# memory/L1_atomic/<id>.md, and appends a row to memory/L1_atomic/INDEX.md.
#
# Hard limits enforced here:
#   - No network calls (this script is local-only)
#   - confidence defaults to "unverified"
#   - scope is mandatory
#   - statement must be non-empty
#
# Usage:
#   bash core/scripts/add-fact.sh
#
# Reference: memory/L1_atomic/SCHEMA.md

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
INDEX="$L1_DIR/INDEX.md"

if [[ ! -d "$L1_DIR" ]]; then
  echo "Error: $L1_DIR does not exist. Run from yamtam-engine root." >&2
  exit 1
fi

echo ""
echo "=== YAMTAM L1 Atomic Memory — Add Fact ==="
echo "Schema: memory/L1_atomic/SCHEMA.md"
echo "Type 'quit' at any prompt to abort."
echo ""

abort_if_quit() {
  [[ "$1" == "quit" ]] && { echo "Aborted."; exit 0; }
}

# ── Prompt: id ────────────────────────────────────────────────────────────────
# Auto-generate a slug from timestamp + short hash
default_id="fact-$(date +%Y%m%d-%H%M%S)"
read -rp "ID [$default_id]: " input_id
input_id="${input_id:-$default_id}"
abort_if_quit "$input_id"

# Sanitise: lowercase, replace spaces with hyphens, strip non-alphanumeric-hyphen
id=$(printf '%s' "$input_id" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
if [[ -z "$id" ]]; then
  echo "Error: ID cannot be empty." >&2
  exit 1
fi

FACT_FILE="$L1_DIR/$id.md"
if [[ -f "$FACT_FILE" ]]; then
  echo "Error: Fact file already exists: $FACT_FILE" >&2
  exit 1
fi

# ── Prompt: type ─────────────────────────────────────────────────────────────
echo "Type options: fact | decision | constraint | assumption | observation"
read -rp "Type [fact]: " input_type
input_type="${input_type:-fact}"
abort_if_quit "$input_type"
case "$input_type" in
  fact|decision|constraint|assumption|observation) ;;
  *) echo "Error: Invalid type '$input_type'." >&2; exit 1 ;;
esac
type="$input_type"

# ── Prompt: statement ─────────────────────────────────────────────────────────
read -rp "Statement (one sentence): " statement
abort_if_quit "$statement"
if [[ -z "$statement" ]]; then
  echo "Error: Statement cannot be empty." >&2
  exit 1
fi

# Safety check: no obvious secret patterns
if printf '%s' "$statement" | grep -qiE '(password|secret|token|api[_-]?key|private[_-]?key|credential)'; then
  echo "Error: Statement appears to contain sensitive data (password/secret/token/key)." >&2
  echo "L1 facts must not store secrets. Store only public facts and decisions." >&2
  exit 1
fi

# ── Prompt: source ────────────────────────────────────────────────────────────
default_source="user:$(date +%Y-%m-%d)"
read -rp "Source [$default_source]: " input_source
source="${input_source:-$default_source}"
abort_if_quit "$source"

# ── Prompt: scope ─────────────────────────────────────────────────────────────
echo "Scope options: YAMTAM | product | both"
read -rp "Scope (required): " input_scope
abort_if_quit "$input_scope"
case "$input_scope" in
  YAMTAM|product|both) ;;
  *) echo "Error: Scope must be YAMTAM, product, or both." >&2; exit 1 ;;
esac
scope="$input_scope"

# ── Prompt: expires_at (optional) ────────────────────────────────────────────
read -rp "Expires at YYYY-MM-DD [leave blank for perpetual]: " expires_at
abort_if_quit "${expires_at:-}"
if [[ -n "$expires_at" ]] && ! printf '%s' "$expires_at" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  echo "Error: expires_at must be YYYY-MM-DD format." >&2
  exit 1
fi

# ── Prompt: evidence (optional) ──────────────────────────────────────────────
read -rp "Evidence path or quoted excerpt [leave blank]: " evidence
abort_if_quit "${evidence:-}"

# ── Prompt: forbidden_assumptions (optional) ─────────────────────────────────
read -rp "Forbidden assumptions (comma-separated) [leave blank]: " raw_forbidden
abort_if_quit "${raw_forbidden:-}"

# ── Prompt: tags (optional) ───────────────────────────────────────────────────
echo "Tags: short, lowercase, hyphenated labels (e.g. hook,memory,scope)"
read -rp "Tags (comma-separated) [leave blank]: " raw_tags
abort_if_quit "${raw_tags:-}"

# ── Prompt: body (optional) ───────────────────────────────────────────────────
echo "Body (additional context, multi-line — press Enter twice to finish):"
body_lines=()
while IFS= read -rp "" body_line; do
  [[ -z "$body_line" && ${#body_lines[@]} -gt 0 && -z "${body_lines[-1]}" ]] && break
  body_lines+=("$body_line")
done
body="$(printf '%s\n' "${body_lines[@]}" | sed '/^$/d')"

# ── Build frontmatter ─────────────────────────────────────────────────────────
frontmatter="---
id: $id
type: $type
statement: $(printf '%s' "$statement" | head -c 500)
source: $source
confidence: unverified
scope: $scope"

if [[ -n "$expires_at" ]]; then
  frontmatter="$frontmatter
expires_at: $expires_at"
fi

if [[ -n "${raw_tags:-}" ]]; then
  # Normalise: lowercase, trim spaces around commas, build YAML inline list
  tags_yaml=$(printf '%s' "$raw_tags" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[[:space:]]*,[[:space:]]*/,/g; s/^[[:space:]]*//; s/[[:space:]]*$//' \
    | awk -F',' 'BEGIN{printf "["} {for(i=1;i<=NF;i++){if(i>1)printf ", "; printf $i}} END{print "]"}')
  frontmatter="$frontmatter
tags: $tags_yaml"
fi

if [[ -n "${evidence:-}" ]]; then
  frontmatter="$frontmatter
evidence: $(printf '%s' "$evidence" | head -c 300)"
fi

if [[ -n "${raw_forbidden:-}" ]]; then
  frontmatter="$frontmatter
forbidden_assumptions:"
  IFS=',' read -ra flist <<< "$raw_forbidden"
  for f in "${flist[@]}"; do
    f="${f#"${f%%[![:space:]]*}"}"  # ltrim
    f="${f%"${f##*[![:space:]]}"}"  # rtrim
    [[ -n "$f" ]] && frontmatter="$frontmatter
  - $f"
  done
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

echo ""
echo "Written: $FACT_FILE"

# ── Update INDEX.md ───────────────────────────────────────────────────────────
statement_short="${statement:0:60}"
[[ "${#statement}" -gt 60 ]] && statement_short="${statement_short}…"

index_row="| $id | $type | $scope | unverified | $statement_short | [$id.md]($id.md) |"

if grep -q "<!-- END INDEX -->" "$INDEX" 2>/dev/null; then
  # Insert row before the END INDEX marker
  tmp=$(mktemp)
  awk -v row="$index_row" '
    /<!-- END INDEX -->/ { print row }
    { print }
  ' "$INDEX" > "$tmp" && mv "$tmp" "$INDEX"
else
  printf '\n%s\n' "$index_row" >> "$INDEX"
fi

echo "Index updated: $INDEX"
echo ""
echo "Fact '$id' added (confidence: unverified, scope: $scope)."
echo "Promote confidence manually after verifying the statement."
