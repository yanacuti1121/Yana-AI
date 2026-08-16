# B3 — A7 / A8 specialist assurance (Workstream B / CI-CD Assurance)

## A8 Release & Supply Chain — status: addressed this pass

The release-manifest requirement (commit SHA, product version, yana-rt
version, OS/arch, Rust toolchain, feature flags, Cargo.lock digest,
artifact SHA256, build timestamp, CI run identity) is implemented in
`.github/workflows/release.yml`'s "Generate release manifest" step
(this workstream, same day). Verified locally before committing: ran
the exact field-extraction logic against this repo's real
`MANIFEST.json`/`Cargo.toml`/`Cargo.lock` and confirmed correct,
independent values for product version (1.3.2) vs. yana-rt version
(1.4.0) per this repo's own `VERSIONING.md` 3-axis scheme. This step
records provenance, not a reproducibility proof, per the program
document's own instruction on that distinction.

Reproducibility-contract fields (same source/platform/toolchain/
locked deps/features/environment) are captured as *recorded facts* in
the manifest (toolchain string, target triple, Cargo.lock digest,
feature flags), not as a verified bit-for-bit reproducibility claim —
no attempt was made here to rebuild the same commit twice and diff the
output, which is what an actual reproducibility proof would require.

## A7 Memory / Parser Security — status: blocked on a structural
precondition, not implemented this pass

### Miri

Checked every `unsafe` block in the codebase (`grep -rln "unsafe"
--include="*.rs" src`, 5 files: `src/flock_v1.rs`, `src/os/supervisor.rs`,
`src/os/platform/macos/service.rs`, `src/os/service/attribution.rs`,
`src/remote/lock.rs`) and read each one directly. Every single hit is a
`libc::` syscall wrapper — `fcntl`, `flock`, `getuid`, `kill` — not
memory-semantics or pointer-manipulation code. This is exactly the case
the program document itself names as a poor fit for full Miri execution
("prefer targeted/nightly if host-native syscalls/FFI make full runtime
execution meaningless"). There is currently no pure-Rust,
memory-semantics-heavy module in this codebase that would give Miri
something real to check beyond what `cargo test` already validates
under the ordinary borrow checker. Forcing a Miri CI job today would
either: (a) fail immediately/uselessly on the syscall-heavy files Miri
can't model, or (b) run against files with no `unsafe` at all, adding
CI time for close to zero incremental safety signal. Recorded as a
verified **no current target**, not a "haven't gotten to it yet" gap —
if a genuinely unsafe-heavy, syscall-free module is added later, this
conclusion should be revisited then, not before.

### Fuzzing

Checked reachability of the document's own named fuzz targets against
the actual crate structure before writing any `fuzz/` scaffold, rather
than writing fuzz targets that would silently fail to compile:

- **Command validator** = `src/guard/portable.rs`'s `pub fn
  check_command(command: &str) -> Option<&'static str>` (confirmed
  during B1's audit as the file with zero existing `#[test]` coverage —
  independently re-confirmed here as the actual "command validator" the
  program document means). A pure `&str -> Option<&str>` function is
  about as fuzz-friendly a signature as exists.
- **Provider JSON / NDJSON / SSE** = `src/model/provider.rs`'s `pub fn
  read_sse_stream<R: Read>(reader: R, on_data: impl FnMut(&str) ->
  Result<()>) -> Result<()>` — also directly fuzzable via a
  `std::io::Cursor` wrapping raw fuzz bytes as the `Read` impl.

**Both are currently unreachable from outside the crate.** Traced the
module tree directly rather than assuming: `src/main.rs` declares
`mod guard;` and `mod model;` as private modules compiled only into the
`yana-rt`/`yana-ai-rt` *binary* targets — neither module is declared in
`src/lib.rs` at all for the general case. `src/lib.rs` does have a
`#[cfg(feature = "wasm")] mod portable_guard;` that path-includes
`guard/portable.rs` under the WASM build, but that `mod` is itself
private (not `pub mod`), so even building with `--features wasm` does
not make `check_command` reachable as a library API — it's only used
internally by `lib.rs`'s own `wasm` submodule wrapper functions.

Standard `cargo-fuzz` scaffolding (a separate `fuzz/` crate that adds
`yana_rt` as a path dependency and calls into it) **cannot call either
target function today**, for any feature combination. Confirmed this is
a real blocker, not a workaround-able one, before writing a single line
of fuzz-target code — a `fuzz/` directory with targets that don't
compile would be exactly the "half-finished, doesn't verify anything"
result this workstream has been avoiding elsewhere (see the B1 audits'
same discipline).

**What would unblock this:** either (a) make `guard::portable` and the
relevant slice of `model::provider` part of `yana_rt`'s public library
API (adding `pub mod guard;` / exposing `read_sse_stream` from
`lib.rs`, not gated behind the `wasm` spike feature), or (b) fuzz via a
binary-harness pattern instead of the library-dependency pattern
cargo-fuzz defaults to. Both are **API-surface / crate-architecture
decisions**, not CI-assurance calls — deciding whether internal
implementation details become part of a published crate's versioned
public API affects semver commitments and encapsulation, which belongs
to whoever owns the runtime crate's architecture (Workstream A), not to
a workflow-file change from this workstream.

## Disposition

Recording both A7 findings as explicit, evidence-backed blockers for
Workstream A's handoff (per "WORKSTREAM B — INPUT REQUIRED FROM A
BEFORE FINAL VERDICT") rather than either skipping them silently or
forcing non-functional scaffolding to look complete. A7 stays **REQUIRES
FURTHER STABILIZATION** in this workstream's eventual B9 categorical
status until the crate-structure question above is answered by whoever
owns it.
