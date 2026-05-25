# YAMTAM ENGINE — Separation Policy

## Core principle

YAMTAM ENGINE is a **personal agent operating system**.
It is NOT a product. It is NOT bundled with any product repo by default.

Any product repo that uses YAMTAM treats it as an **external tool**, applied
via a release pack into the target's `.claude/` directory.

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

### YAMTAM repo (this repo) contains:

```txt
core/hooks/         hook source
core/scripts/       support scripts
core/tests/         hook test suite
gates/              truth gate, action gate specs
docs/               YAMTAM internal docs
releases/           versioned packs
CHANGELOG.md
ROADMAP.md
MANIFEST.json
README.md
```

### YAMTAM repo does NOT contain:

```txt
any product application code (app/, components/, lib/, etc.)
any product database schema or migrations
any product UI assets (public/, static/)
any environment files (.env, .env.*)
any product-specific secrets, API keys, or credentials
any product-specific handover documents
```

### Target product repo contains (after applying YAMTAM):

```txt
.claude/hooks/      ← copied from YAMTAM release pack
.claude/scripts/    ← copied from YAMTAM release pack
.claude/tests/      ← copied from YAMTAM release pack
```

### Target product repo does NOT contain:

```txt
MEMORY.md           ← agent operating file, lives outside product repo
BRAIN_DUMP.md       ← agent operating file, lives outside product repo
agent checkpoint files
gates/              ← YAMTAM internal
docs/               ← YAMTAM internal (product has its own docs/)
```

---

## How YAMTAM is applied to a product

1. Cut a release in YAMTAM repo:
   `releases/yamtam-engine-vX.Y.Z-fixed.zip`
2. In the target product repo:
   ```bash
   unzip yamtam-engine-vX.Y.Z-fixed.zip -d .claude/
   ```
3. Commit to the product repo with a clear message:
   ```
   chore: apply YAMTAM ENGINE vX.Y.Z-fixed
   ```

The release pack contains only `hooks/`, `scripts/`, `tests/`.
No memory, no docs, no operating files.

---

## How to update YAMTAM in a product

Same as apply — unzip overwrites. Always re-run the test suite afterward.
Never edit hooks directly inside a product repo. All edits happen in this
YAMTAM repo, then a new release is cut and applied.

---

## How to remove YAMTAM from a product

```bash
git rm -r .claude/hooks/ .claude/scripts/ .claude/tests/
git commit -m "chore: remove YAMTAM ENGINE hooks"
```

---

## README policy

- Product README: product description, contribution history. Untouched by YAMTAM.
- YAMTAM README: operating system description, apply guide.
- The two READMEs do not cross-reference each other in detail.
- A product README MAY note "this repo uses YAMTAM ENGINE vX.Y.Z" in tooling section.
