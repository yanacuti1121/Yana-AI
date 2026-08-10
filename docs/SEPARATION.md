# Yana AI — Separation Policy

## Core principle

Yana AI is a **personal agent operating system and its canonical first-party
product/runtime monorepo**. It is NOT bundled with an unrelated target product
repo by default.

Any product repo that uses Yana AI treats it as an **external tool**, applied
through the target's `.claude/` directory for Claude Code and the standard
`.codex/`, `.agents/skills/`, and `AGENTS.md` surfaces for Codex.

---

## Why separated

Mixing operating tooling with product code causes:

- Handover packages leak agent operating files to recipients who do not
  need them (teachers, clients, downstream developers).
- Agent memory, brain dumps, and decision logs become visible in the
  product repo, which is inappropriate.
- Version drift: product releases vs tooling releases get conflated.
- Cross-scope edits: an agent operating on the product can accidentally
  modify operating tooling, and vice versa.

---

## Boundary rules

### Yana AI repo (this repo) contains:

```txt
core/hooks/         hook source
core/scripts/       support scripts
core/tests/         hook test suite
core/contracts/     versioned first-party runtime/UI contracts
src/                canonical yana-rt runtime source
tools/yana-web/     canonical first-party web/desktop UI source
gates/              truth gate, action gate specs
docs/               Yana AI internal docs
releases/           versioned packs
CHANGELOG.md
ROADMAP.md
MANIFEST.json
README.md
```

### Yana AI repo does NOT contain:

```txt
any unrelated target-product application code (app/, components/, lib/, etc.)
any unrelated target-product database schema or migrations
any unrelated target-product UI assets (public/, static/)
any environment files (.env, .env.*)
any product-specific secrets, API keys, or credentials
any product-specific handover documents
```

"Product" in the exclusions above means a target project using Yana AI, not
Yana's own first-party surfaces. Per ADR-011, this repository is canonical for
`yana-rt` and the first-party UI; the standalone `yana-web` repository is a
one-way release mirror, while `Yana-AI-Chat_Teminal` is an incubator whose work
must be reviewed and promoted here before release. Neither external repository
may overwrite canonical source automatically.

### Target product repo contains (after applying Yana AI):

```txt
.claude/hooks/      ← copied from Yana AI release pack
.claude/scripts/    ← copied from Yana AI release pack
.claude/tests/      ← copied from Yana AI release pack
.codex/config.toml  ← Codex project settings
.codex/hooks.json   ← Codex lifecycle hook registration
.codex/hooks/       ← Codex-compatible copies of Yana AI hooks
.codex/agents/      ← Codex custom-agent TOML files
.agents/skills/     ← Codex project skills + generated command adapters
AGENTS.md           ← created only when the target has no existing guidance
```

### Target product repo does NOT contain:

```txt
MEMORY.md           ← agent operating file, lives outside product repo
BRAIN_DUMP.md       ← agent operating file, lives outside product repo
agent checkpoint files
gates/              ← Yana AI internal
docs/               ← Yana AI internal (product has its own docs/)
```

---

## How Yana AI is applied to a product

1. Cut a release in Yana AI repo:
   `releases/yana-ai-vX.Y.Z-fixed.zip`
2. In the target product repo:
   ```bash
   unzip yana-ai-vX.Y.Z-fixed.zip -d .claude/
   ```
3. Commit to the product repo with a clear message:
   ```
   chore: apply Yana AI vX.Y.Z-fixed
   ```

The Claude release pack contains only `hooks/`, `scripts/`, `tests/`.
No memory, no docs, no operating files.

For Codex, run `yana-ai install --engine codex` after installing the Python
package, or run `bash core/scripts/switch-engine.sh codex` from a Yana AI source
checkout. Existing target `AGENTS.md` files are preserved; the installer creates
one only when the target has none. Node/npm is not required.
Parity rules and engine mappings are documented in `docs/ENGINE_PARITY.md`.

---

## How to update Yana AI in a product

Same as apply — unzip overwrites. Always re-run the test suite afterward.
Never edit hooks directly inside a product repo. All edits happen in this
Yana AI repo, then a new release is cut and applied.

---

## How to remove Yana AI from a product

```bash
git rm -r .claude/hooks/ .claude/scripts/ .claude/tests/
git commit -m "chore: remove Yana AI hooks"
```

---

## README policy

- Product README: product description, contribution history. Untouched by Yana AI.
- Yana AI README: operating system description, apply guide.
- The two READMEs do not cross-reference each other in detail.
- A product README MAY note "this repo uses Yana AI vX.Y.Z" in tooling section.
