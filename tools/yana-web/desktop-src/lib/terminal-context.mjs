// Yana AI — bounded terminal context snapshot (Desktop Terminal vertical
// slice, Phase C).
//
// Deliberately captures ONLY what a raw PTY byte stream can reliably give
// us: bounded recent output, the directory the session was SPAWNED in
// (echoed back by Electron main — see main.js's yana:pty-start handler —
// not guessed client-side), and PTY/process status. It does NOT attempt to
// parse shell prompts to infer per-command boundaries, exit codes, or a
// command history — that requires real shell integration (OSC 133-style
// markers) and is explicitly a later layer, not this slice. See
// docs/adr (Desktop Terminal plan) for the phasing.
//
// cwd semantics (do not get this wrong): `initialCwd` is a ONE-TIME
// snapshot taken when the PTY was spawned. Nothing in this module (or
// anywhere else in this stack) observes a `cd` the user types afterward —
// there is no live-cwd tracking. Do not rename this back to a bare "cwd"
// or otherwise imply it tracks the shell's current directory; that would
// be a false claim about what a raw PTY byte stream can actually tell us.
// TODO (future slice, NOT this one): real live-cwd tracking needs actual
// shell integration — e.g. OSC 7 (`\x1b]7;file://host/cwd\x07`, already
// emitted by bash/zsh's default prompt hooks on most distros) or OSC 133
// (semantic prompt markers, also gives real command-boundary/exit-code
// data "for free"). Until one of those is wired up, do NOT attempt to
// infer cwd by parsing prompt text — see the module header above and the
// architecture correction that added this note: brittle prompt parsing
// is explicitly rejected as a substitute for real shell integration.
//
// Trust: every field here is UNTRUSTED external data — raw bytes from
// whatever program the user's shell happened to run (compiler output,
// package scripts, arbitrary external programs), never something Yana
// generated or vetted. Callers (use-chat-send.js -> server.js) MUST keep
// treating it as data attached to the turn, never as a system instruction
// — see server.js's appendWorkspaceContext for where that boundary is
// enforced. `trust: "untrusted"` is included directly in the snapshot so
// that boundary is explicit at every hop, not just documented here.
//
// In-memory only, module-level singleton — never written to disk, never
// sent anywhere except as an explicit, capped block attached to an
// outgoing chat request (use-chat-send.js). This is the ONE thing this
// module must never regress: no unbounded growth, no persistence.

const MAX_OUTPUT_CHARS = 4000;

let initialCwd = null;
let recentOutput = "";
let ptyStatus = "idle"; // 'idle' | 'running' | 'exited'
let exitCode = null;

export function recordStart(startedCwd) {
  initialCwd = typeof startedCwd === "string" ? startedCwd : null;
  recentOutput = "";
  ptyStatus = "running";
  exitCode = null;
}

export function recordData(chunk) {
  if (typeof chunk !== "string" || !chunk) return;
  recentOutput = (recentOutput + chunk).slice(-MAX_OUTPUT_CHARS);
}

export function recordExit(code) {
  ptyStatus = "exited";
  exitCode = Number.isInteger(code) ? code : null;
}

export function reset() {
  initialCwd = null;
  recentOutput = "";
  ptyStatus = "idle";
  exitCode = null;
}

// Returns null when no terminal session has ever started this app run —
// callers (use-chat-send.js) should omit workspace context entirely in
// that case rather than send an empty/meaningless block.
export function getSnapshot() {
  if (ptyStatus === "idle") return null;
  return {
    trust: "untrusted",
    initialCwd,
    recentOutput: recentOutput.slice(-MAX_OUTPUT_CHARS),
    ptyStatus,
    exitCode,
  };
}

export const __TEST_ONLY__ = { MAX_OUTPUT_CHARS };
