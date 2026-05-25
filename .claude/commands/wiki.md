---
description: "Generate or refresh static wiki docs from the gitnexus knowledge graph and commit to docs/wiki/. Agents read docs/wiki/ instead of scanning code — saves tokens significantly."
---

# /wiki

Generate a static wiki from the gitnexus knowledge graph and save it to `docs/wiki/` (git-tracked).

## Usage

```
/wiki                     # generate wiki and show output path
/wiki --force             # force full regeneration
/wiki --commit            # generate and auto-commit
/wiki --model <model>     # use specific LLM
/wiki --api-key <key>     # provide LLM API key inline
```

## What it does

1. Checks `npx gitnexus status` — index must exist (run `npx gitnexus analyze` if not)
2. Runs `npx gitnexus wiki` to generate docs from the knowledge graph
3. Copies output to `docs/wiki/` for git tracking
4. Optionally commits with `--commit`

## Agent read pattern

After wiki is generated, agents should prefer:

```
Read docs/wiki/<topic>.md       # instead of grepping source code
Read docs/wiki/index.md         # or whatever index gitnexus generates
```

This avoids scanning hundreds of source files and reduces context window usage.

## Workflow

**First time:**
```bash
npx gitnexus analyze            # build the index
bash .claude/scripts/generate-wiki.sh --commit
```

**After major code changes:**
```bash
npx gitnexus analyze --force    # refresh index
bash .claude/scripts/generate-wiki.sh --force --commit
```

**In CI / release flow:**
Add to build pipeline after tests pass:
```bash
bash .claude/scripts/generate-wiki.sh --commit
```

## Keep docs/wiki/ fresh

Add `generate-wiki.sh` call to your release process so the wiki is always
current when agents read it. A stale wiki is worse than no wiki — agents
will trust incorrect docs.

If using a PostToolUse `git commit` hook, you can automate regeneration:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{"type": "command", "command": "bash .claude/scripts/generate-wiki.sh --commit 2>/dev/null || true"}]
    }]
  }
}
```

## Notes

- Requires `npx` and gitnexus index — no global install needed
- LLM API key is stored in `~/.gitnexus/config.json` on first use
- Use `--base-url` for self-hosted LLM endpoints (v1.6.x feature)
- `--force` bypasses incremental generation (gitnexus v1.6.5+)
