//! Generic PTY-over-stdio bridge. Spawns `<program> [args...]` inside a
//! real pseudo-terminal of the requested size, then shuttles raw bytes:
//! PTY output -> this process's own stdout, this process's own stdin ->
//! PTY input. Exits with the child's own exit code once it exits.
//!
//! Not chat-specific — Electron's main process (`tools/yana-desktop/
//! main.js`) decides what to spawn (a user shell for the Terminal panel, or
//! `node scripts/yana-rt-wrapper.js chat [...]` for the embedded chat pty,
//! reusing that script's already-hardened binary-resolution logic rather
//! than duplicating it here). This binary's only job is the OS-level PTY
//! plumbing — it never decides what program runs.
//!
//! Usage: pty_bridge <cols> <rows> -- <program> [args...]
//!
//! Resize: a 4th fd (fd 3), opened by the caller alongside stdin/stdout/
//! stderr, is read for NUL-terminated `RESIZE <cols> <rows>\n` control
//! lines and calls `PtyPair::master.resize(...)` accordingly. Kept
//! deliberately separate from fd 0/1/2 so terminal input/output framing
//! never has to be taught to distinguish a resize command from real
//! keystrokes or program output.
//!
//! Kept dependency-light on purpose (no clap/anyhow) — this binary is
//! gated behind the `pty-bridge` feature specifically so it never
//! affects the default `yana-rt` build's footprint or dependency graph.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::exit;
use std::sync::{Arc, Mutex};
use std::thread;

const USAGE: &str = "usage: pty_bridge <cols> <rows> -- <program> [args...]";

struct Args {
    cols: u16,
    rows: u16,
    program: String,
    program_args: Vec<String>,
}

fn parse_args() -> Args {
    let argv: Vec<String> = std::env::args().collect();
    // argv[0] is this binary's own path.
    if argv.len() < 5 || argv[3] != "--" {
        eprintln!("{USAGE}");
        exit(2);
    }
    let cols: u16 = argv[1].parse().unwrap_or_else(|_| {
        eprintln!("{USAGE}\ncols must be a number, got {:?}", argv[1]);
        exit(2);
    });
    let rows: u16 = argv[2].parse().unwrap_or_else(|_| {
        eprintln!("{USAGE}\nrows must be a number, got {:?}", argv[2]);
        exit(2);
    });
    let rest = &argv[4..];
    Args {
        cols,
        rows,
        program: rest[0].clone(),
        program_args: rest[1..].to_vec(),
    }
}

/// Maps `portable_pty::ExitStatus` (its own simplified type, not
/// `std::process::ExitStatus` — `Child::wait()` on this crate's `Child`
/// trait returns this one) to a process exit code. That type only
/// exposes a numeric `exit_code()` OR a signal *name* string (never a
/// signal number) — a signal-killed child maps to the conventional `128`
/// sentinel rather than `128 + <number>`, since no number is available
/// through this API.
fn exit_code_for(status: &portable_pty::ExitStatus) -> i32 {
    if status.signal().is_some() {
        128
    } else {
        status.exit_code() as i32
    }
}

/// Reads `RESIZE <cols> <rows>\n` lines from fd 3 (opened by the caller,
/// e.g. Electron's `spawn(..., { stdio: ['pipe','pipe','pipe','pipe'] })`)
/// for the lifetime of the process. A missing/unopened fd 3 (the caller
/// didn't wire a 4th stdio pipe) is not an error — `File::read` on a
/// closed fd just returns EOF immediately, so this thread exits quietly
/// and the bridge behaves exactly as it did before resize support existed.
///
/// Unix only: fd-passing past 0/1/2 is a POSIX convention with no Windows
/// equivalent (ConPTY resize there would need a different mechanism
/// entirely). Live resize on Windows is a known, documented gap for this
/// vertical slice, not a silent omission — see `main()`'s call site.
#[cfg(unix)]
fn spawn_resize_listener(master: Arc<Mutex<Box<dyn MasterPty + Send>>>) {
    use std::os::fd::FromRawFd;
    thread::spawn(move || {
        // Safety: fd 3 is a caller-provided contract (documented above),
        // identical in kind to inheriting fd 0/1/2 — this process does not
        // open or allocate the fd itself, only takes ownership of one the
        // parent already set up before exec.
        let control = unsafe { std::fs::File::from_raw_fd(3) };
        let mut lines = BufReader::new(control).lines();
        while let Some(Ok(line)) = lines.next() {
            let mut parts = line.split_whitespace();
            let (Some("RESIZE"), Some(cols), Some(rows)) =
                (parts.next(), parts.next(), parts.next())
            else {
                continue;
            };
            let (Ok(cols), Ok(rows)) = (cols.parse::<u16>(), rows.parse::<u16>()) else {
                continue;
            };
            if let Ok(master) = master.lock() {
                let _ = master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
            }
        }
    });
}

#[cfg(not(unix))]
fn spawn_resize_listener(_master: Arc<Mutex<Box<dyn MasterPty + Send>>>) {
    // No fd-3 control channel on this platform yet — see the doc comment
    // on the `#[cfg(unix)]` twin above.
}

fn main() {
    let args = parse_args();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: args.rows, cols: args.cols, pixel_width: 0, pixel_height: 0 })
        .unwrap_or_else(|e| {
            eprintln!("pty_bridge: failed to open pty: {e}");
            exit(1);
        });

    let mut cmd = CommandBuilder::new(&args.program);
    cmd.args(&args.program_args);

    let child = pair.slave.spawn_command(cmd).unwrap_or_else(|e| {
        eprintln!("pty_bridge: failed to spawn '{}': {e}", args.program);
        exit(1);
    });
    // Critical: drop our own handle to the slave side right after
    // spawning. On Unix, the master's reader never sees EOF while any
    // process — including this bridge itself — still holds the slave fd
    // open, even after the spawned child has actually exited.
    drop(pair.slave);

    let master = Arc::new(Mutex::new(pair.master));
    let mut reader = master
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .try_clone_reader()
        .unwrap_or_else(|e| {
            eprintln!("pty_bridge: failed to clone pty reader: {e}");
            exit(1);
        });
    let mut writer = master
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take_writer()
        .unwrap_or_else(|e| {
            eprintln!("pty_bridge: failed to take pty writer: {e}");
            exit(1);
        });

    spawn_resize_listener(Arc::clone(&master));

    // pty -> our stdout. Keep the JoinHandle: the exit-watcher thread below
    // must wait for this to actually finish draining before it tears the
    // process down, or a fast-exiting child's tail output races the exit
    // and is silently lost — the child exiting does not imply this thread
    // has already been scheduled to read what it wrote. Reproduced live
    // pre-fix: `bash -c 'echo x; exit 7'` through this bridge lost the
    // echo in 2 of 3 runs.
    let reader_handle = thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut stdout = io::stdout();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => return, // EOF or read error — nothing more to forward
                Ok(n) => {
                    if stdout.write_all(&buf[..n]).is_err() || stdout.flush().is_err() {
                        return;
                    }
                }
            }
        }
    });

    // child exit -> this process's exit code (also unblocks the main
    // thread's blocking stdin read below, since process::exit() tears
    // down the whole process regardless of which thread is blocked
    // where). Joining the reader thread first guarantees every byte the
    // child ever wrote has already reached our own stdout — see that
    // thread's own doc comment for why this ordering is load-bearing, not
    // decorative.
    thread::spawn(move || {
        let mut child = child;
        let code = match child.wait() {
            Ok(status) => exit_code_for(&status),
            Err(_) => 1,
        };
        let _ = reader_handle.join();
        exit(code);
    });

    // our stdin -> pty (main thread — its own blocking read is exactly
    // the call the exit-watcher thread's process::exit() needs to be
    // able to interrupt; waiting on stdin EOF instead of child exit
    // would hang, since Electron's pipe to our stdin never naturally
    // closes on its own).
    let mut buf = [0u8; 8192];
    let mut stdin = io::stdin();
    loop {
        match stdin.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if writer.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        }
    }
    // Reaching here means our own stdin closed (or a pty write failed)
    // before the child exited on its own. Drop the writer so the pty's
    // slave side sees EOF too — the real-terminal Ctrl-D equivalent,
    // lets a foreground process notice input has ended and exit on its
    // own terms — then park forever. The exit-watcher thread above is
    // the ONLY path that ever calls process::exit(): calling it here
    // too, before `child.wait()` has actually returned, would report a
    // fabricated exit code instead of the child's real one. `park()` in
    // a loop is safe to leave "hanging" — `process::exit()` from another
    // thread tears down the whole process unconditionally, regardless of
    // what this thread is doing when it fires.
    drop(writer);
    loop {
        thread::park();
    }
}
