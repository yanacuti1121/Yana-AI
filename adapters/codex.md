# Yana AI — Codex Project Guidance

Read `.codex/config.toml`, `.codex/hooks.json`, and the applicable files under
`.agents/skills/` before acting.

Claude-style commands are available as generated Codex skills. Invoke
`/verify` as `$yana-command-verify`, `/debug` as `$yana-command-debug`, and use
the same `$yana-command-<name>` pattern for every file in `core/commands/`.

## Safety

- Show evidence before claiming work is complete, fixed, clean, or tested.
- State the file scope before writes.
- Ask before commits, pushes, deployments, destructive commands, or production writes.
- Never edit secrets or environment files.
- Keep changes surgical and do not overwrite unrelated user work.

## Verification

- Start with the narrowest relevant test.
- Report the exact command and result.
- If verification cannot run, label the result unverified.

Run `node core/scripts/check-engine-parity.js` to confirm Claude and Codex expose
the same shared instructions, agents, skills, commands, and active hooks.
