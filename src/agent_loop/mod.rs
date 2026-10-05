//! The agent run loop (WS2 R1, docs/contracts/ws2-runtime.md section 4).
//!
//! An `AgentRun` wraps `TurnEngine::run`: it takes the session's lock, saves every message
//! as it completes, enforces limits (tokens, tool rounds, wall time, idle time), and turns
//! the engine's outcome into a `RunReport`. Every tool call still goes through the engine's
//! authority chain; nothing here runs a tool.

// The module is built ahead of its callers (chat, cron and subagents are wired in by
// later, separately approved steps), so items are unused in the binary for now.
#![allow(dead_code)]

mod clock;
mod record;
mod run;
mod watchdog;

#[cfg(test)]
mod tests;

pub(crate) use clock::Clock;
#[cfg(test)]
pub(crate) use clock::ManualClock;
#[allow(unused_imports)]
pub(crate) use run::{AgentRun, RunInput};

use crate::model::provider::ChatUsage;
use std::time::Duration;

/// Limits for a whole run. A `0` token limit or a zero duration means that limit is off;
/// a cron job or a subagent must never be started with all of them off (checked by their callers).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RunLimits {
    pub max_tool_rounds: usize,
    pub max_input_tokens: u64,
    pub max_output_tokens: u64,
    /// Total time since the run started.
    pub wall: Duration,
    /// Longest time with no event at all (no chunk, no tool start or end).
    pub idle: Duration,
}

impl Default for RunLimits {
    fn default() -> Self {
        Self { max_tool_rounds: 8, max_input_tokens: 0, max_output_tokens: 0, wall: Duration::ZERO, idle: Duration::ZERO }
    }
}

/// What stopped a run before it finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Limit {
    ToolRounds,
    InputTokens,
    OutputTokens,
    Wall,
    Idle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RunStatus {
    Completed,
    Cancelled,
    /// The model asked for something that needs a person. The request was saved as a
    /// pending approval with this id; continuing is a new run on the same session.
    AwaitingApproval(String),
    LimitReached(Limit),
    Failed(String),
}

#[derive(Debug, Clone)]
pub(crate) struct RunReport {
    pub status: RunStatus,
    /// The model's last message when the run completed (or what it had said when it stopped).
    pub final_message: String,
    pub usage: ChatUsage,
    pub tool_rounds: usize,
    pub session_id: String,
}

/// Why a run could not even start (nothing was run, nothing was saved after the lock).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RunError {
    /// Another process is working on this session.
    Busy(String),
    Store(String),
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Busy(id) => write!(f, "session {id} is being used by another run"),
            Self::Store(why) => write!(f, "cannot use the session store: {why}"),
        }
    }
}

impl std::error::Error for RunError {}
