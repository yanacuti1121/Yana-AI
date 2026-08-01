---
description: Restrict all file edits (Write/Edit/MultiEdit) to one or more directories/files/regex patterns for the rest of this session — a hard, hook-enforced boundary, not a self-reported convention. Usage: /freeze <path-or-pattern> [path-or-pattern...]
argument-hint: [directory, file, or regex — e.g. core/rules  or  core/hooks/foo.sh core/commands/bar.md  or  ^core/hooks/.*\.sh$]
---

Run:

```bash
bash core/scripts/freeze-scope.sh set $ARGUMENTS
```

(Unquoted `$ARGUMENTS` — this command takes multiple space-separated paths/patterns, not one string.)

This sets `.claude/state/FREEZE_SCOPE` as a JSON array of patterns derived from the given arguments. From this point in the session, `core/hooks/freeze-scope.sh` (a `PreToolUse` hook, always checked automatically — nothing else needs to run) denies any `Write`/`Edit`/`MultiEdit` whose target file matches none of them, with exit code 2 and a clear reason shown back to you.

Each argument is converted independently, existing filesystem state checked first:
- **A real directory** (e.g. `core/rules`) → restricted to everything under it — the original, most common `/freeze <directory>` usage, unchanged in effect.
- **A real, already-existing file** (e.g. `core/hooks/foo.sh`, including one whose name happens to contain regex-looking characters) → always restricted to exactly that one file, never reinterpreted as a pattern.
- **A not-yet-existing path with no regex-looking characters** (the common case for a file you're about to create) → also restricted to exactly that one file.
- **A not-yet-existing path that also looks like a regex** (e.g. `^core/hooks/.*\.sh$`, or a planned filename that happens to contain `( ) [ ] { } ^ $ * + ? |`) → treated as a literal POSIX-ERE pattern — validated at `set` time; a malformed pattern is rejected immediately with a clear error. This is the one case existence-checking can't disambiguate (the file doesn't exist yet to check): if you're about to create a file whose exact name contains one of those characters, say so explicitly rather than relying on auto-detection.

A target is allowed if it matches **any** one of the given patterns (OR semantics) — `/freeze core/hooks/foo.sh core/commands/bar.md` allows writes to either file, nothing else.

Report the script's own output to the user verbatim — it already states what is and isn't restricted. If the script errors (bad path or bad regex), surface that error rather than retrying with a guessed value; ask the user for the correct one.

**This does not check Bash commands.** A shell command that writes outside the frozen directory is not caught by this specific hook, and no other hook knows the frozen scope exists either — `guard-destructive.sh` only blocks specific destructive command *patterns* (`rm -rf`, `git push --force`, etc.), unrelated to any directory boundary, and `scope-guard.sh` only warns (never blocks) against its own fixed, hardcoded path list, not whatever directory you passed to `/freeze`. So a Bash command that writes outside the frozen directory via redirection or a CLI tool is not blocked by anything on the basis of the freeze. Don't rely on `/freeze` to sandbox a task end-to-end — it only covers Write/Edit/MultiEdit.

Use `/unfreeze` to lift the restriction. It does not clear automatically at session end — if you started a session already frozen from a previous one, say so rather than assuming it reset.
