# Discord Adapter — Checkpoint

**Status:** Minimum vertical slice IMPLEMENTED, TESTED, PARTIALLY LIVE-VERIFIED.
**Program:** master-prompt-driven evolution (Aizen Learning × Discord Adapter ×
Host-Native OS × Evolution Governance), continuing from the completed
Host-Native OS Program (`.yana-ai/program-host-native-os-checkpoint.md`,
PR #203 + hotfix PR #204).

## What this checkpoint covers

1. Aizen research pass (real source read, not summarized from docs).
2. Discord Phase design (canonical session/actor/capability/evidence boundaries).
3. The minimum safe vertical slice: read-only chat, no capability/tool access.

## Aizen research — summary (full report given in-conversation, not duplicated here)

Source revision inspected: `aizen-stack/aizen` @ `4b63acef489bd9b373a9cc43c39acd5ac677aef4`.

Key decisions: ADOPT the thin-adapter shape (I/O only, zero business logic —
proven by Aizen's own `discord.rs`) and the fail-closed allowlist. ADAPT
per-workspace-root writer serialization as a future inter-process lock
(matching `os::supervisor::ReceiptsLock`'s pattern, not Aizen's in-process
`tokio::Mutex`) if/when this adapter grows write capability. REJECT Aizen's
collapsed approval model — one `ApprovalMode` config knob shared by local
CLI and every remote surface, so a user's own `Yolo` convenience setting
silently extends to their bot. DEFER Git Time Machine and the BM25 memory
subsystem — real, valuable, orthogonal to this phase, need their own passes.
ALREADY EXISTS: multi-provider model abstraction, cross-platform service
installation, SSRF blocking (all more complete in Yana already than in
Aizen).

**The single most important finding:** Aizen's real code concretely
demonstrates the exact risk the master prompt's own §23 (Remote Control
Threat Model) warns about in the abstract. This directly shaped the design
below.

## Design decisions (Discord Phase)

- **Canonical session ownership:** `chat::history::SessionMetadata.session_id`
  — the same one every other Yana interface uses. A Discord channel/thread
  is a POINTER to one of these (`.yana-ai/os/remote-sessions.json`), never
  an identity of its own. See `src/remote/session.rs`'s module doc.
- **Actor mapping:** `os::identity::Actor::human(format!("discord:{user_id}"))`,
  scoped globally per Discord user (not per-channel/guild) — `os::identity`
  widened from private to `pub(crate)` (matching the existing precedent set
  by `os::resource`) so `remote::session` can reuse it directly rather than
  inventing a parallel identity concept.
- **Capability/approval path:** NONE in this slice, by construction —
  `stream_chat` is called with `tools: &[]`. This is the direct, deliberate
  answer to the Aizen finding above: rather than reuse whatever local
  approval/autonomy setting exists (which `capability::` doesn't even have
  an actor parameter for yet — see the PR #203 post-merge audit's finding
  F2), this phase grants Discord messages NO capability access at all.
  Extending this requires designing an independently-bounded remote
  approval ceiling first, not wiring into existing local config.
- **Evidence path:** two SEPARATE trails, deliberately not merged:
  `.yana-ai/os/remote-requests.jsonl` (routine, append-only, one line per
  turn, `Actor::as_receipt_actor()` + platform/chat/session) is new for
  this phase. `os::supervisor`'s safety-event hash chain (halt/unlock/
  quarantine) is untouched — high-frequency chat traffic must not be mixed
  into the receipt chain PR #204 just hardened.
- **Discord adapter boundary:** `src/remote/discord.rs` — config, allowlist,
  REST client, gateway client. Zero references to `capability::`, `os::
  service`, or any file/git/process mutation anywhere in the file — a
  structural property, verifiable by `grep`, not a runtime check.
- **Concurrency:** deliberately single-threaded/sequential in this slice.
  Aizen's `LaneRegistry` was evaluated (ADAPT, not ADOPT-now) — a real
  inter-process version is future work once this slice is proven.

## Implementation

- New Cargo feature `discord` (`Cargo.toml`), isolated from default `cli`
  the same way `mcp` is isolated — pulls in `tungstenite` (sync WebSocket,
  not `tokio-tungstenite`) + `rustls` (explicit crypto-provider install),
  reuses `ureq` (already a `cli` dependency) for REST rather than adding a
  second HTTP client. Deliberately sync, not async — `yana-rt`'s default
  build has zero async runtime dependencies; adding Discord's gateway
  loop as a second tokio-requiring feature (after `mcp`) was rejected in
  favor of matching this crate's existing sync-first convention (`ureq`,
  `crossterm`'s sync poll/read API).
- `src/remote/session.rs` — session/actor mapping + the request evidence
  trail. Compiled unconditionally under `cli` (not gated by `discord`) so
  its pure-logic tests run in the default gate matrix.
- `src/remote/discord.rs` — config, allowlist, REST client, gateway client
  (gated by `discord`).
- `src/remote/mod.rs` — turn-processing (`handle_turn`), `serve`,
  `test_connection`, `setup_instructions` (gated by `discord`).
- `src/main.rs` — `yana-rt remote discord {setup,test,serve}` CLI surface.
- `src/os/mod.rs` — `mod identity;` → `pub(crate) mod identity;` (one-line
  visibility widen, matching the existing `pub(crate) mod resource;`
  precedent and its stated reasoning).

## Test evidence

- `cargo test --features cli` (default, no discord): 529/529 (523 baseline
  + 6 always-on `remote::session` tests).
- `cargo test --features "cli discord"`: 536/536 (523 + 13: 6 session + 7
  discord-specific).
- `cargo test --features "cli mcp discord"`: 538/538 (525 mcp-baseline + 13).
- `cargo build` clean (zero errors) for `cli`, `cli discord`, and
  `cli mcp discord` combinations.
- `cargo clippy --features "cli discord" --no-deps`: zero warnings on any
  file this phase touches.
- `cargo fmt --check`: clean on all touched files.
- `bash core/tests/hooks/run-hook-tests.sh`: 311/311.
- `bash core/scripts/verify-core-lock.sh`: PASS, 280 pinned, 0 drift.

## Live verification (honest accounting — matches this program's existing
## evidence discipline)

**LIVE VERIFIED against Discord's real infrastructure**, with a throwaway
token (no real bot exists in this environment):
- `discord test` → real HTTPS request to `discord.com/api/v10/users/@me`,
  real HTTP 401 response, correct error handling (not a panic/hang).
- `discord serve` → real WSS connection to `gateway.discord.gg`, correct
  HELLO frame parse (real `heartbeat_interval` extracted), correct
  IDENTIFY send, and Discord's real server correctly rejected the fake
  token with close code 4004 — which this code correctly classified as a
  permanent (`FatalCloseError`) failure and stopped cleanly, not looping/
  reconnecting (avoiding an IDENTIFY-storm ban risk).
- A real, live bug was found and fixed during this exact test: `tungstenite`
  panics on first TLS connect without an explicit `rustls` crypto-provider
  install (`ureq`'s own TLS setup does not cover it). Fixed with a
  `std::sync::Once`-guarded `rustls::crypto::ring::default_provider()
  .install_default()` call at the top of `run_gateway`.

**LOGIC TESTED, NOT LIVE VERIFIED:** the happy path (successful IDENTIFY,
a real MESSAGE_CREATE dispatch, a real reply sent) — requires a real bot
token and an invitation to a real server, neither available in this
environment. This is the recommended next action for whoever has Discord
credentials: run `yana-rt remote discord setup`, then `test`, then `serve`
with a real allowlisted channel, and confirm a message round-trip.

## Deferred / explicit non-goals (this slice)

Remote shell, file writes, git mutation, capability lease issuance via
Discord, inline approval UI, cross-interface session handoff UX (the
identity model that makes it POSSIBLE exists; the actual handoff flow does
not) — matching the master prompt's own phased instruction. Per this
program's now-established governance pattern (see
`feedback_fresh_context_adversarial_review` in the assistant's own memory),
this slice should get a fresh, independent adversarial review before any
of these are added, not just before merge of this slice itself.

## Rollback

Single feature-gated addition; disabling is `git revert` of this branch's
commit(s), or simply never enabling `--features discord` (default build
is provably unaffected — see test evidence above).
