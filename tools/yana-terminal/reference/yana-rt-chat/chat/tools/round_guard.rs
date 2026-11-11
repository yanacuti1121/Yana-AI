//! Caps consecutive tool-call rounds within a single user turn, so a
//! model stuck proposing tool calls forever can't hang the session. A
//! distinct, purpose-built counter rather than a second instance of
//! `chat/circuit_breaker.rs`'s `CircuitBreaker` — that type's actual
//! mechanism (failure counting *plus* a wall-clock cooldown with
//! escalating backoff) solves "stop hammering a flaky connection over
//! time," a different problem from "cap rounds within one already-
//! in-flight turn," which needs no cooldown timer at all (it resets the
//! instant the next user turn starts).

/// Ballpark ceiling — generous enough for a legitimate multi-step task
/// (read a few files, run a command, read the result), low enough that a
/// genuinely stuck loop aborts within a handful of rounds instead of
/// running indefinitely.
const DEFAULT_CEILING: u32 = 8;

pub struct ToolRoundGuard {
    rounds: u32,
    ceiling: u32,
}

impl ToolRoundGuard {
    pub fn new() -> Self {
        Self { rounds: 0, ceiling: DEFAULT_CEILING }
    }

    pub fn record_round(&mut self) {
        self.rounds += 1;
    }

    pub fn exceeded(&self) -> bool {
        self.rounds > self.ceiling
    }

    pub fn reset(&mut self) {
        self.rounds = 0;
    }
}

impl Default for ToolRoundGuard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn does_not_exceed_before_ceiling() {
        let mut g = ToolRoundGuard::new();
        for _ in 0..DEFAULT_CEILING {
            g.record_round();
            assert!(!g.exceeded());
        }
    }

    #[test]
    fn exceeds_after_ceiling() {
        let mut g = ToolRoundGuard::new();
        for _ in 0..=DEFAULT_CEILING {
            g.record_round();
        }
        assert!(g.exceeded());
    }

    #[test]
    fn reset_clears_count() {
        let mut g = ToolRoundGuard::new();
        for _ in 0..=DEFAULT_CEILING {
            g.record_round();
        }
        assert!(g.exceeded());
        g.reset();
        assert!(!g.exceeded());
    }
}
