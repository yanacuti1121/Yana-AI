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
// `pub(crate)`, not private: `crate::os::agent` (Program K) reads
// `list_recent_sessions`/`SessionSummary` as the real data source for
// `yana-rt os agent-list`.
pub(crate) mod history;
mod input;
mod openai_compat;
mod settings;
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

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub(crate) struct ProviderSummary {
    pub name: String,
    pub runtime: String,
    pub requires_key: bool,
    pub env_var: Option<String>,
}

/// Canonical provider catalog shared by chat and management surfaces.
/// Constructing providers is side-effect free; this never probes a server or
/// reads a credential value.
pub(crate) fn provider_catalog() -> Vec<ProviderSummary> {
    [
        "anthropic",
        "openai",
        "kimi",
        "ollama",
        "lmstudio",
        "llamacpp",
        "turbofieldfare",
    ]
    .into_iter()
    .map(|name| {
        let provider = try_select_provider(name).expect("catalog provider must be selectable");
        ProviderSummary {
            name: provider.name().to_string(),
            runtime: provider.runtime_kind().label().to_string(),
            requires_key: provider.requires_key(),
            env_var: provider
                .requires_key()
                .then(|| provider.env_var().to_string()),
        }
    })
    .collect()
}

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
        "lmstudio" => Ok(Arc::new(openai_compat::lm_studio())),
        "llamacpp" => Ok(Arc::new(openai_compat::llama_cpp())),
        "kimi" => Ok(Arc::new(openai_compat::kimi())),
        "turbofieldfare" => Ok(Arc::new(openai_compat::turbofieldfare())),
        other => Err(format!(
            "unknown provider '{other}' — use ollama | lmstudio | llamacpp | turbofieldfare | anthropic | openai | kimi"
        )),
    }
}

#[cfg(test)]
mod provider_catalog_tests {
    use super::*;

    #[test]
    fn catalog_matches_every_selectable_provider() {
        let names: Vec<String> = provider_catalog()
            .into_iter()
            .map(|item| item.name)
            .collect();
        assert_eq!(
            names,
            [
                "anthropic",
                "openai",
                "kimi",
                "ollama",
                "lmstudio",
                "llamacpp",
                "turbofieldfare"
            ]
        );
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

fn resolve_default_model(provider: &Arc<dyn ChatProvider>) -> String {
    if provider.name() == "ollama" {
        if let Some(detected) = openai_compat::detect_ollama_model() {
            eprintln!("[chat] auto-detected Ollama model: {detected}");
            return detected;
        }
        eprintln!(
            "[chat] no Ollama model detected at 127.0.0.1:11434 (daemon not running, or nothing \
             pulled) — falling back to '{}', which may not actually be pulled. Run `ollama pull \
             {}`, or pass --model / use /model to name one that is.",
            provider.default_model(),
            provider.default_model()
        );
    }
    provider.default_model().to_string()
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
    let repo_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let chat_settings = settings::load(&repo_root).unwrap_or_default();
    let use_configured_model = provider_name.is_none();
    let provider_name = provider_name.or_else(|| Some(chat_settings.default_provider.clone()));
    let provider = select_provider(provider_name.as_deref());
    let model = model
        .or_else(|| {
            use_configured_model
                .then_some(chat_settings.default_model)
                .flatten()
        })
        .unwrap_or_else(|| resolve_default_model(&provider));
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
            Ok(mut msgs) => {
                match history::repair_dangling_tool_call(id, &mut msgs) {
                    Ok(true) => eprintln!(
                        "[chat] repaired a tool call left unresolved by a previous crash/force-quit"
                    ),
                    Ok(false) => {}
                    Err(e) => eprintln!("[chat] warning: failed to repair dangling tool call: {e}"),
                }
                (id.clone(), msgs)
            }
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

    let app = tui::App::new(
        provider,
        model,
        system,
        api_key,
        session_id,
        history,
        verbose,
        resumed,
        use_sandbox,
    );
    if let Err(e) = tui::run(&mut guard, app) {
        drop(guard); // restore the terminal before printing, not after
        eprintln!("[chat] fatal: {e:#}");
        std::process::exit(1);
    }
}
