---
description: Restrict all file edits (Write/Edit/MultiEdit) to one directory for the rest of this session — a hard, hook-enforced boundary, not a self-reported convention. Usage: /freeze <directory>
argument-hint: [directory — e.g. core/rules]
---

Run:

```bash
bash core/scripts/freeze-scope.sh set "$ARGUMENTS"
```

This sets `.claude/state/FREEZE_SCOPE` to the given directory. From this point in the session, `core/hooks/freeze-scope.sh` (a `PreToolUse` hook, always checked automatically — nothing else needs to run) denies any `Write`/`Edit`/`MultiEdit` whose target file falls outside that directory, with exit code 2 and a clear reason shown back to you.

Report the script's own output to the user verbatim — it already states what is and isn't restricted. If the script errors (directory doesn't exist), surface that error rather than retrying with a guessed path; ask the user for the correct one.

**This does not check Bash commands.** A shell command that writes outside the frozen directory is not caught by this specific hook, and no other hook knows the frozen scope exists either — `guard-destructive.sh` only blocks specific destructive command *patterns* (`rm -rf`, `git push --force`, etc.), unrelated to any directory boundary, and `scope-guard.sh` only warns (never blocks) against its own fixed, hardcoded path list, not whatever directory you passed to `/freeze`. So a Bash command that writes outside the frozen directory via redirection or a CLI tool is not blocked by anything on the basis of the freeze. Don't rely on `/freeze` to sandbox a task end-to-end — it only covers Write/Edit/MultiEdit.

Use `/unfreeze` to lift the restriction. It does not clear automatically at session end — if you started a session already frozen from a previous one, say so rather than assuming it reset.
