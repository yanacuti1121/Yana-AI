#!/usr/bin/env bash
# Semantic search over L1 atomic facts using TF-IDF cosine similarity.
# No external deps — uses python3 stdlib only.
#
# Usage:
#   bash search-facts-semantic.sh "redis caching pattern"
#   bash search-facts-semantic.sh "auth bypass" --top 5
#   bash search-facts-semantic.sh "scope boundary" --threshold 0.1
#
# Falls back to grep-based search if python3 unavailable.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"

QUERY=""
TOP=3
THRESHOLD="0.05"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --top)       shift; TOP="$1" ;;
    --threshold) shift; THRESHOLD="$1" ;;
    *)           QUERY="$QUERY $1" ;;
  esac
  shift
done

QUERY=$(echo "$QUERY" | xargs)

if [[ -z "$QUERY" ]]; then
  echo "Usage: search-facts-semantic.sh <query> [--top N] [--threshold 0.05]" >&2
  exit 1
fi

if [[ ! -d "$L1_DIR" ]]; then
  echo "✗ L1 memory not found: $L1_DIR" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  # Fallback: keyword grep
  echo "[fallback: python3 not found, using grep]"
  grep -rl "$QUERY" "$L1_DIR" --include="*.md" | grep -v "INDEX\|SCHEMA" | head -"$TOP"
  exit 0
fi

python3 - "$L1_DIR" "$QUERY" "$TOP" "$THRESHOLD" <<'PYEOF'
import sys, os, re, math
from pathlib import Path

l1_dir = Path(sys.argv[1])
query = sys.argv[2]
top_n = int(sys.argv[3])
threshold = float(sys.argv[4])

def tokenize(text):
    """Simple word tokenizer: lowercase, strip punctuation, remove stopwords."""
    STOP = {'the','a','an','is','in','of','to','and','or','for','with','this',
            'that','be','are','was','were','by','as','at','it','on','from','not',
            'have','has','had','do','does','did','will','would','could','should',
            'may','might','shall','must','can'}
    words = re.findall(r"[a-z']+", text.lower())
    return [w for w in words if len(w) > 2 and w not in STOP]

def tfidf_vector(tokens, idf):
    """Build TF-IDF vector as dict."""
    tf = {}
    for t in tokens:
        tf[t] = tf.get(t, 0) + 1
    n = len(tokens) or 1
    return {t: (count / n) * idf.get(t, 1.0) for t, count in tf.items()}

def cosine(v1, v2):
    """Cosine similarity between two dicts."""
    common = set(v1) & set(v2)
    if not common:
        return 0.0
    dot = sum(v1[k] * v2[k] for k in common)
    mag1 = math.sqrt(sum(x*x for x in v1.values()))
    mag2 = math.sqrt(sum(x*x for x in v2.values()))
    return dot / (mag1 * mag2 + 1e-9)

# Load all facts
facts = []
for md_file in l1_dir.glob("*.md"):
    if md_file.name in ('INDEX.md', 'SCHEMA.md'):
        continue
    content = md_file.read_text(errors='ignore')
    # Extract statement + body (skip frontmatter markers)
    body = re.sub(r'^---.*?---', '', content, flags=re.DOTALL).strip()
    stmt_match = re.search(r'^statement:\s*(.+)$', content, re.MULTILINE)
    stmt = stmt_match.group(1).strip().strip('"\'') if stmt_match else ''
    search_text = f"{stmt} {body}"
    tokens = tokenize(search_text)
    facts.append({'file': md_file.stem, 'tokens': tokens, 'statement': stmt or body[:100]})

if not facts:
    print("No facts found in L1 memory.")
    sys.exit(0)

# Build IDF
doc_freq = {}
for fact in facts:
    for t in set(fact['tokens']):
        doc_freq[t] = doc_freq.get(t, 0) + 1
N = len(facts)
idf = {t: math.log((N + 1) / (df + 1)) + 1 for t, df in doc_freq.items()}

# Score query against facts
query_tokens = tokenize(query)
q_vec = tfidf_vector(query_tokens, idf)

scored = []
for fact in facts:
    f_vec = tfidf_vector(fact['tokens'], idf)
    sim = cosine(q_vec, f_vec)
    scored.append((sim, fact))

scored.sort(key=lambda x: -x[0])

results = [(sim, fact) for sim, fact in scored if sim >= threshold][:top_n]

if not results:
    print(f"No facts found above similarity threshold {threshold}.")
    print(f"Try lowering --threshold or using different keywords.")
    sys.exit(0)

print(f"Top {len(results)} fact(s) for \"{query}\":\n")
for rank, (sim, fact) in enumerate(results, 1):
    print(f"  {rank}. [{fact['file']}]  sim={sim:.3f}")
    print(f"     {fact['statement'][:120]}")
    print()
PYEOF
