//! Agent management (Program K, area 1 of 3 — see `PROGRAM-K-YANA-OS-SKELETON.md`).
//!
//! This is a read-only registry view, not a scheduler: it lists agent chat
//! sessions that already exist on disk (`.yana-ai/chat-history/*.jsonl`,
//! written by `crate::chat::history`), it does not create, kill, or
//! supervise anything. "Lifecycle/identity/execution sessions" as a real
//! management surface (start/stop, health, ownership) is still `_(TODO)_`
//! per the skeleton's own Design Goals section.

/// Prints the `limit` most recently active agent sessions. Real data only —
/// an empty history dir prints a plain "no sessions" line, not a mocked row.
pub fn list(limit: usize) {
    let sessions = crate::chat::history::list_recent_sessions(limit);
    if sessions.is_empty() {
        println!("No agent sessions found in .yana-ai/chat-history/");
        return;
    }
    println!("Agent sessions  ({} shown, limit {limit})", sessions.len());
    println!("{}", "─".repeat(70));
    for s in &sessions {
        let provider = s.provider.as_deref().unwrap_or("?");
        let model = s.model.as_deref().unwrap_or("?");
        let short_id = s.session_id.chars().take(8).collect::<String>();
        println!(
            "  {short_id}  {:<12} {:<20} {:>3} turns  {}",
            provider, model, s.turn_count, s.last_ts
        );
    }
}

// No unit test here: `list()` is a thin print wrapper over
// `chat::history::list_recent_sessions` (already covered by
// `chat/history.rs`'s own test module), and testing it directly would mean
// mutating the process-wide current directory — the exact pattern that
// already causes a known flaky parallel-test-isolation issue elsewhere in
// this crate (`guard::blast_paths`). Verified instead via a real
// `cargo run --features cli --bin yana-rt -- os agent-list` smoke test.
