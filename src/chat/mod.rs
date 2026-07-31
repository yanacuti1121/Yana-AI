//! `yana-rt chat` — interactive TUI. Was pure conversation only through
//! the first MVP (send text, stream text back, zero tool-calling); now
//! supports 2 tools — `read_file` (repo-root-sandboxed, no approval
//! needed) and `run_command` (gated by `crate::guard::check_command()`
//! plus mandatory interactive human approval before every execution, see
//! `tui/approval.rs`). This is Program J's ("Universal Capability
//! Runtime," `docs/programs/PROGRAM-J-SKELETON.md`) originally-planned
//! "Phase 4 — Beta" scope for this client, brought forward ahead of that
//! doc's documented Alpha phase (Cursor MCP migration, not yet started)
//! at anh's explicit request — see that doc's Roadmap section for the
//! reprioritization note.
//!
//! `.claude/settings.json`'s PreToolUse/PostToolUse hooks fire only on
//! tool calls Claude Code itself makes; a standalone binary run directly
//! by a human is a separate process those hooks structurally cannot see,
//! the same way they can't see a human typing `curl`. That's exactly why
//! `run_command` cannot lean on Claude Code's hook system for safety and
//! instead builds its own gate in-process: `check_command()` (the same
//! judgment function `core/hooks/guard-destructive.sh` and Program J's
//! MCP spike, `src/mcp.rs`, both already use — never a second pattern
//! list) as a hard pre-check, then a mandatory y/N in the TUI before
//! anything executes, then (by default) routing through
//! `core/scripts/sandbox-exec.sh` for real isolation on top of both.
//! `read_file` needs no such gate — it's read-only and sandboxed to the
//! repo root (Gate L5 path-traversal check), so it runs inline without
//! pausing the turn.
//!
//! Side note on `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`: reading these from
//! the process environment to authenticate this CLI's own outbound request
//! is the same category as `aws`/`gh`/`stripe` doing the same — not the
//! "AI agent code" scenario `52-secrets-vault-law.md`'s honey-vault policy
//! targets (an AST scan for literal decoy secret *values* seeded from
//! `HONEY_*` vars, not a block on the env var *name* — confirmed by
//! reading `core/gates/sovereign-interceptor.js` directly).

mod anthropic;
mod banner;
mod circuit_breaker;
mod history;
mod openai_compat;
// pub(crate), not private: `task.rs`'s `cmd_eval_judge` (a sibling module of
// `chat`, not a descendant) needs `provider::ask_once` and the
// `ChatProvider` trait itself in scope to call `.requires_key()`/`.env_var()`
// — private-to-`chat` visibility only reaches `chat`'s own descendants
// (anthropic.rs, tui/, etc.), not siblings under the crate root.
pub(crate) mod provider;
mod terminal_guard;
mod tool_types;
mod tools;
mod tui;

use anthropic::AnthropicProvider;
use provider::ChatProvider;
use std::sync::Arc;
use uuid::Uuid;

/// Non-exiting core: used both by startup (which wraps it with
/// exit-on-error, safe since it always runs before any `TerminalGuard`
/// exists) and by the in-session `/model` command (`tui.rs`), which must
/// NEVER call `std::process::exit()` — that would skip the render loop's
/// Drop-based terminal cleanup on the way out.
pub(crate) fn try_select_provider(name: &str) -> Result<Arc<dyn ChatProvider>, String> {
    match name {
        "anthropic" => Ok(Arc::new(AnthropicProvider)),
        "openai" => Ok(Arc::new(openai_compat::openai())),
        "ollama" => Ok(Arc::new(openai_compat::ollama())),
        "kimi" => Ok(Arc::new(openai_compat::kimi())),
        other => Err(format!("unknown provider '{other}' — use anthropic | openai | ollama | kimi")),
    }
}

fn select_provider(name: Option<&str>) -> Arc<dyn ChatProvider> {
    match name {
        Some(n) => match try_select_provider(n) {
            Ok(p) => p,
            Err(msg) => {
                eprintln!("[chat] {msg}");
                std::process::exit(2);
            }
        },
        // Auto-detect: prefer a cloud provider whose key is already set,
        // fall back to local Ollama (keyless, so always "selectable" even
        // though the daemon might not actually be running — that's a
        // runtime failure on first message, not a selection failure).
        None => {
            if std::env::var("ANTHROPIC_API_KEY").is_ok() {
                Arc::new(AnthropicProvider)
            } else if std::env::var("OPENAI_API_KEY").is_ok() {
                Arc::new(openai_compat::openai())
            } else {
                Arc::new(openai_compat::ollama())
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn dispatch(
    provider_name: Option<String>,
    model: Option<String>,
    system: Option<String>,
    resume: Option<String>,
    verbose: bool,
    use_sandbox: bool,
) {
    let provider = select_provider(provider_name.as_deref());
    let model = model.unwrap_or_else(|| provider.default_model().to_string());
    let api_key = if provider.requires_key() {
        match std::env::var(provider.env_var()) {
            Ok(k) if !k.is_empty() => Some(k),
            _ => {
                eprintln!(
                    "[chat] {} not set — export it, or run with --provider ollama for a local model",
                    provider.env_var()
                );
                std::process::exit(2);
            }
        }
    } else {
        None
    };

    let resumed = resume.is_some();
    let (session_id, history) = match &resume {
        Some(id) => match history::load(id) {
            Ok(msgs) => (id.clone(), msgs),
            Err(e) => {
                eprintln!("[chat] {e}");
                std::process::exit(2);
            }
        },
        None => (Uuid::new_v4().to_string(), Vec::new()),
    };

    // Everything above runs strictly before any terminal mode is touched —
    // none of these 3 exit(2) paths need Drop-safety, since no
    // `TerminalGuard` exists on the stack at any of them yet.

    let mut guard = match terminal_guard::TerminalGuard::new() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("[chat] {e:#}");
            std::process::exit(1);
        }
    };

    let app = tui::App::new(provider, model, system, api_key, session_id, history, verbose, resumed, use_sandbox);
    if let Err(e) = tui::run(&mut guard, app) {
        drop(guard); // restore the terminal before printing, not after
        eprintln!("[chat] fatal: {e:#}");
        std::process::exit(1);
    }
}
