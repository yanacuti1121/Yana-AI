# Buzz integration — Program J Phase 10 (scoped)

**Status:** Implemented and verified at the protocol level (2026-07-27).
**Scope:** narrow — this wires Yana AI's existing MCP spike into Buzz as
an additional safety tool for whatever agent Buzz orchestrates. It does
**not** implement Program J's full vision (replacing every engine's
translator scripts); see `PROGRAM-J-SKELETON.md` for that larger,
still-`Draft` scope, which this integration does not advance or block.

## What this is

[Buzz](https://github.com/block/buzz) (Apache-2.0) is a self-hostable
Nostr-relay team workspace where humans and AI agents share channels as
first-class members, each with their own keypair. Its `buzz-acp` crate
spawns an ACP-compliant coding agent (goose, codex, claude-code, or
`buzz-agent` itself) per session and can wire in an *additional* MCP
server for that agent to call, via the `BUZZ_ACP_MCP_COMMAND` env var.

Yana AI's Program J Phase 9 spike (`src/mcp.rs`) already built exactly
the kind of MCP server this slot expects: it exposes one tool,
`check_command`, calling `crate::guard::check_command()` in-process —
the same pure, adversarially-reviewed logic `core/hooks/guard-destructive.sh`
mirrors for Claude Code. Until this integration, nothing called it.

This means every agent Buzz orchestrates — not just Claude Code — can now
be given the same destructive-command check Yana AI already enforces,
with no new detection logic: `src/mcp.rs` is unmodified by this work.

## What it does NOT do

- It does not make the spawned agent *call* `check_command` automatically.
  Whether an agent checks a command before running it depends on that
  agent's own tool-use policy and system prompt — Buzz just makes the
  tool *available* alongside its own `buzz-dev-mcp` (shell/file-edit)
  server. Nothing on the wire forces the check.
- It does not give Yana AI visibility into Buzz channels, messages, or
  events (a separate direction, "post significant Yana AI events to a
  Buzz channel," was considered and explicitly deferred — not part of
  this work).
- It does not change `yana-rt`'s default build: the `mcp` Cargo feature
  stays opt-in (`cargo build --release --features mcp`), matching
  `Cargo.toml`'s own documented reason for gating it (first tokio
  dependency, deliberately kept out of the normal build's footprint).

## Setup

**1. Build yana-rt with the `mcp` feature:**

```bash
cargo build --release --features mcp
```

**2. Point Buzz at the wrapper script, not the bare binary.**

`buzz-acp` invokes `BUZZ_ACP_MCP_COMMAND` with **zero arguments**
(`crates/buzz-acp/src/lib.rs`'s `build_mcp_servers()`: `args: vec![]`) —
but `yana-rt` requires the `mcp` subcommand to run in MCP mode. Pointing
`BUZZ_ACP_MCP_COMMAND` directly at the `yana-rt` binary would just print
its normal CLI help, not start the server. `scripts/yana-rt-mcp-wrapper.sh`
exists for exactly this: it resolves the built binary (`$YANA_RT_BIN` if
set, else `target/release/yana-rt`, else `target/debug/yana-rt` —
deliberately no bare-`yana-rt`-on-`$PATH` fallback, see the script's own
header for why) and execs it with the `mcp` argument supplied.

```bash
export BUZZ_ACP_MCP_COMMAND=/absolute/path/to/Yana-AI/scripts/yana-rt-mcp-wrapper.sh
```

**3. Generate a Yana AI agent identity and register it with the relay**
(both are Buzz-side steps, run from a Buzz checkout):

```bash
cargo run -p buzz-admin -- generate-key
# prints a pubkey + secret key (nsec1...) -- the secret is not stored,
# save it yourself; set it as BUZZ_PRIVATE_KEY for the buzz-acp process

# relay owner runs, once, to admit the new agent:
cargo run -p buzz-admin -- add-member --pubkey <the pubkey printed above>
```

**4. Start `buzz-acp`** with `BUZZ_PRIVATE_KEY`, `BUZZ_RELAY_URL`, and
`BUZZ_ACP_MCP_COMMAND` set. Whatever agent it spawns (`BUZZ_ACP_AGENT_COMMAND`,
default `goose`) now has `check_command` available as an MCP tool.

## Verified (2026-07-27)

Built `cargo build --release --features mcp` (clean, exit 0) and drove
`scripts/yana-rt-mcp-wrapper.sh` directly over stdio with raw MCP
JSON-RPC — the same zero-argument invocation `buzz-acp` performs — to
confirm the whole chain (wrapper → binary → MCP protocol → tool call)
actually works, not just that the pieces exist individually:

```json
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"rmcp","version":"2.2.0"},"instructions":"Yana AI destructive-command guard (Program J Phase 9 spike). Tool: check_command."}}

→ {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_command","arguments":{"command":"rm -rf /tmp/x"}}}
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"permission\":\"deny\",\"reason\":\"Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first.\"}"}],"isError":false}}

→ {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_command","arguments":{"command":"git status"}}}
← {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"permission\":\"allow\"}"}],"isError":false}}
```

Cross-checked against `core/hooks/guard-destructive.sh` directly for the
same two commands: identical verdict and identical reason text
(`permissionDecision: "deny"` with the exact same message string for the
`rm -rf` case; exit 0/no output for `git status`) — confirming the MCP
tool and the Claude Code hook enforce the same policy, not a
reimplementation that could drift from it.

**Not verified in this environment:** an actual live `buzz-acp` process
spawning a real agent and that agent genuinely calling the tool mid-session
— standing up Buzz Desktop requires Docker + Hermit + a Tauri build per
its own Quick Start, out of reach here. The protocol-level test above
exercises the real contract boundary (exactly what `buzz-acp` sends and
expects back), which is what changes if either side's interface breaks;
finishing the live hookup is a manual step for whoever runs Buzz for real.

## References

- `src/mcp.rs` — the MCP server (unmodified by this work)
- `scripts/yana-rt-mcp-wrapper.sh` — the zero-arg wrapper this integration added
- `docs/programs/PROGRAM-J-SKELETON.md` — Program J's full scope and status
- `docs/ARCHITECTURE.md`'s "Cross-Engine Adapter Architecture" — where this
  fits alongside Yana AI's other four engine integrations
- Buzz: `crates/buzz-acp/README.md` (env var config table),
  `crates/buzz-acp/src/lib.rs`'s `build_mcp_servers()` (confirms the
  zero-argument invocation contract)
