# Discord Adapter — Checkpoint

**Status:** Minimum vertical slice IMPLEMENTED, TESTED, PARTIALLY LIVE-VERIFIED,
POST-REVIEW FIXES APPLIED (see "Post-review findings and fixes" below —
anh's own review of PR #205 found 2 real HIGH issues and several smaller
ones before merge; this is not a hypothetical checklist, every item below
was found in the actual shipped code and independently verified).
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

- `cargo test --features cli` (default, no discord): 531/531 (523 baseline
  + 8 always-on `remote::session`/`remote::lock` tests — post-review
  count, was 6 before the two new always-on regression tests).
- `cargo test --features "cli discord"`: 539/539 (523 + 16: 8 session/lock
  + 8 discord-specific — post-review count, was 536/13 before).
- `cargo test --features "cli mcp discord"`: 541/541 (525 mcp-baseline + 16).
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

## Post-review findings and fixes

anh's review of the original PR #205 diff found 2 real HIGH issues (both
confirmed against the actual code, not assumed) plus several smaller ones,
before merge:

1. **HIGH — model inference blocked the gateway heartbeat.** `on_message`
   (which calls `provider.stream_chat`, blocking for the full model turn)
   was called directly, inline, in the SAME loop iteration that also
   sends/checks heartbeats. A slow turn (30-90s, an ordinary latency for
   some providers) meant heartbeats couldn't be sent, ACKs couldn't be
   read, and RECONNECT/other messages couldn't be received for that whole
   duration — a protocol-correctness bug in the exact happy path this
   checkpoint had marked "LOGIC TESTED, NOT LIVE VERIFIED." **Fixed:** the
   gateway thread now only ever pushes `Incoming` onto an `mpsc` channel
   (non-blocking); a separate worker thread drains it and calls
   `on_message` there, sequentially. Regression test
   `dispatch_never_blocks_while_the_worker_is_mid_turn` proves the
   underlying mechanism (a slow worker never blocks a new dispatch) —
   a full live reproduction against Discord's real gateway with a
   deliberately slow provider was judged impractical to keep as an
   automated test, so this proves the mechanism directly instead.
2. **HIGH — `resolve_session`'s read-modify-write transaction had no
   inter-process lock**, the same race class PR #204 fixed in the receipt
   chain: two processes (or, later, two adapters) racing a channel neither
   has seen could both create a session and both durably record different
   ids for the same channel. **Fixed:** the entire transaction is now held
   under a real inter-process lock (`src/remote/lock.rs` — same technique
   as `os::supervisor::ReceiptsLock`, a parallel implementation rather
   than reusing that PR's already-reviewed private type directly, and
   explicitly designed to be reusable by a future second adapter sharing
   this same mapping file, per anh's own stated preference for a
   transaction lock over single-instance enforcement). Regression test
   `resolve_session_serializes_two_racing_first_writers_into_one_session`
   — verified genuinely regression-testing by temporarily commenting out
   the lock line: failed 8/8 runs; restored, passes 5/5 (both checked
   directly).
3. **MEDIUM — `remote-requests.jsonl`'s append had no lock either**,
   same failure mode, lower severity because this trail was already
   documented as best-effort/non-safety-critical. **Fixed:** now uses the
   same `remote/lock.rs` mechanism (a different lock file than the session
   mapping's, so the two transactions never contend with each other).
4. **`message_id` added to `Incoming` and the request evidence log.** Not
   used for deduplication yet (this slice is read-only chat, where a
   duplicate reply is a nuisance, not a safety issue) — kept from the
   first schema version specifically because it is cheap to carry now and
   expensive to retrofit correctly once entries without it already exist.
5. **`RemoteSessionLink.actor_id` renamed to `created_by_actor_id`.** The
   old name invited misreading as "the current/authorized actor"; the
   field has only ever meant "who created this mapping" — a different
   user can post later in the same allowed channel and correctly resume
   the same session without this field ever being (or needing to be)
   updated to reflect them, since session identity here is
   per-conversation/channel, not per-person (see the module doc).
6. **"Read-only" wording corrected** in three doc comments (`discord.rs`'s
   module doc, `main.rs`'s `Remote`/`Discord` CLI help text) to "no
   host/tool capabilities; chat-state writes only" — the slice DOES write
   (session mapping, chat history, this evidence trail), it just never
   touches `capability::`/`os::service`/file/git/process mutation. "Read-
   only" was accurate about capability access and misleading about disk
   writes.
7. **ENV credential documented as transitional**, not the target
   architecture, with the specific gap named: `os::platform::
   secret_backend()` is presence-only by design and cannot supply this
   value; `os::credential`'s `has_entry` check can report "configured" for
   a Keychain-only secret that `std::env::var` then fails to find — a
   real, pre-existing mismatch this PR did not introduce and is
   explicitly not fixing (scope creep). A genuine secret-provider API is
   future work.

**Recorded as DEFER / explicit non-goals, not fixed now** (anh's own
review classified these as real but not blocking this slice):

- **Cross-interface trust boundary, once handoff exists:** the current
  schema (session identity alone) does not yet distinguish session
  identity from surface visibility or conversation participants. If a
  future desktop client resumes the same `session_id` a Discord channel
  points to and adds private context, the next Discord turn's
  `chat::history::load(&session_id)` would include it — nothing in
  today's slice builds that handoff UX, but the schema is laying
  groundwork for it and should not be extended toward real handoff
  without solving this first.
- **Discord gateway RESUME is not implemented.** Reconnects always
  re-IDENTIFY fresh (matches Aizen's own documented remaining gap in
  `discord.rs`'s module doc, not a regression introduced here); a
  transient disconnect can lose events. Acceptable for a v1 read-only
  bot; MUST be solved (along with real `message_id` dedup, not just the
  field being present) before any future write/approval capability, where
  a duplicated or dropped action is a safety issue, not a UX nuisance.
- Guild-level allowlisting was considered and not added — channel IDs are
  already a sufficiently narrow scope for this slice.

## CI fixes (after the HIGH/MEDIUM round above)

The push that carried the fixes above failed two real CI gates, both
legitimate findings from checks this branch hadn't run locally before
pushing:

- `yana-rt doctor dispatch . --json` flagged the new `Remote` `Commands`
  enum variant in `src/main.rs` as unreachable from the CLI — it existed
  in the Rust binary but `bin/yana`'s dispatch case statement never routed
  to it. **Fixed:** added `remote` to the same feature-gated-subcommand
  pipe-list `mcp` already uses, plus a matching help-text line.
- `core/scripts/generate-stats.py --check` flagged README.md and
  `docs/reference/architecture.md`'s subcommand counts (33) as stale
  against the real filesystem count (34, the new `remote` subcommand).
  **Fixed:** updated both to 34, verified against the script's own
  `--check` exit code (0 after the fix).

## Final review pass — one additional finding (not in anh's original review)

Per anh's explicit request to check everything thoroughly one more time
before merge, a completely fresh, independent worktree (detached HEAD,
no prior context carried over) was used to re-read all four core files
end to end. This surfaced one new issue anh's own review had not
flagged, in the worker-thread design introduced by fix #1 above:

- **The worker thread spawned by `run_gateway` had no panic isolation.**
  If `on_message` (which calls into `handle_turn`/`provider.stream_chat`)
  ever panicked, the worker thread would die permanently, while the
  gateway thread's `let _ = tx.send(inc);` would keep silently accepting
  and dropping every future message — a bot that looks alive (heartbeats
  keep flowing, so nothing external signals a problem) but never answers
  again, with zero error output anywhere. **Fixed:** the `on_message` call
  inside the worker loop is now wrapped in
  `std::panic::catch_unwind(std::panic::AssertUnwindSafe(...))`, logging
  a recovered panic to stderr and continuing to drain the channel.
  Regression test `worker_survives_a_panicking_turn_and_keeps_processing`
  reproduces the worker-loop pattern standalone with a deliberately
  panicking message sandwiched between two normal ones, asserting both
  that the worker thread itself never panics (`handle.join()` succeeds)
  and that the two normal messages are processed while the panicking one
  is correctly absent from the output — verified passing, full suite
  re-run clean at 540/540 across both binaries, `cargo clippy` zero
  warnings on `remote/`, `rustfmt --check` clean.

## Rollback

Single feature-gated addition; disabling is `git revert` of this branch's
commit(s), or simply never enabling `--features discord` (default build
is provably unaffected — see test evidence above).
