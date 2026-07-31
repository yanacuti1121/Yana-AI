//! Generic PTY-over-stdio bridge. Spawns `<program> [args...]` inside a
//! real pseudo-terminal of the requested size, then shuttles raw bytes:
//! PTY output -> this process's own stdout, this process's own stdin ->
//! PTY input. Exits with the child's own exit code once it exits.
//!
//! Not chat-specific — Electron's main process (`tools/yana-desktop/
//! main.js`) decides what to spawn (today: `node scripts/
//! yana-rt-wrapper.js chat [...]`, reusing that script's already-
//! hardened binary-resolution logic rather than duplicating it here).
//! This binary's only job is the OS-level PTY plumbing.
//!
//! Usage: pty_bridge <cols> <rows> -- <program> [args...]
//!
//! Kept dependency-light on purpose (no clap/anyhow) — this binary is
//! gated behind the `pty-bridge` feature specifically so it never
//! affects the default `yana-rt` build's footprint or dependency graph.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{self, Read, Write};
use std::process::exit;
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

    let mut reader = pair.master.try_clone_reader().unwrap_or_else(|e| {
        eprintln!("pty_bridge: failed to clone pty reader: {e}");
        exit(1);
    });
    let mut writer = pair.master.take_writer().unwrap_or_else(|e| {
        eprintln!("pty_bridge: failed to take pty writer: {e}");
        exit(1);
    });

    // pty -> our stdout
    thread::spawn(move || {
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
    // where).
    thread::spawn(move || {
        let mut child = child;
        let code = match child.wait() {
            Ok(status) => exit_code_for(&status),
            Err(_) => 1,
        };
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
