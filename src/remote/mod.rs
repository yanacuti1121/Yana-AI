//! Remote interfaces (Host-Native OS Program, Discord Phase). An interface
//! module, alongside `chat` (TUI) — consumes Yana's existing runtime, never
//! owns policy/capability/authority decisions itself (master prompt §12,
//! §26: "Interfaces sit around this architecture... they consume Yana,
//! they do not own Yana authority").
//!
//! # What this phase deliberately does NOT build yet
//!
//! Per the Aizen research pass (`.yana-ai/program-discord-adapter-checkpoint.md`),
//! Discord messages in this slice reach the model plane directly for plain
//! chat and NOTHING else: `discord::run_gateway`'s callback in `dispatch`
//! below calls `model::provider::stream_chat` with `tools: &[]`. There is
//! no code path from a Discord message to `capability::`, `os::service`,
//! or any file/git/process mutation. This is intentional and structural,
//! not a missing feature: `os::identity`'s own lease system has zero
//! callers gating any real `capability::` execution today (confirmed
//! during the PR #203 post-merge audit), and Aizen's own approval model
//! demonstrates the exact risk of skipping this design step — a single
//! shared approval knob between local CLI convenience and remote-triggered
//! actions. Wiring Discord to any capability beyond plain chat requires
//! designing that boundary first, not reusing whatever exists today.
//!
//! # Session ownership
//!
//! See `session.rs` for the full reasoning. Short version: a Discord
//! channel is a POINTER to a `chat::history` session_id, never an
//! identity of its own — the same session_id a desktop/TUI client would
//! use, so a conversation can in principle continue across interfaces
//! without changing identity (the actual cross-interface handoff UX is
//! not built in this slice; only the identity model that makes it
//! possible without a later migration is).
//!
//! # Concurrency
//!
//! Deliberately single-threaded/sequential in this slice: one gateway
//! connection, one message processed at a time. Aizen's `LaneRegistry`
//! (per-conversation concurrent workers) was evaluated in the research
//! pass and classified ADAPT, not ADOPT-now — a real inter-process
//! version (matching `os::supervisor::ReceiptsLock`'s pattern from PR
//! #204, not Aizen's in-process `tokio::Mutex`) is a reasonable future
//! phase once this slice is proven, not a prerequisite for it.

#[cfg(feature = "discord")]
pub mod discord;
mod lock;
pub mod session;

#[cfg(feature = "discord")]
mod dispatch {
    use super::discord::{self, Incoming};
    use super::session;
    use crate::model::catalog::try_select_provider;
    use anyhow::{Context, Result};
    use std::path::Path;

    const PLATFORM: &str = "discord";

    /// One Discord message, start to finish: allowlist already checked by
    /// `discord::run_gateway` before this is called. Resolves/creates the
    /// Yana session, appends the user turn, calls the model with the full
    /// history and zero tools, appends the assistant turn, and returns the
    /// text to reply with.
    fn handle_turn(
        root: &Path,
        provider_name: &str,
        model_name: &str,
        incoming: &Incoming,
    ) -> Result<String> {
        let actor_id = session::remote_actor_id(PLATFORM, &incoming.user_id);
        let session_id = session::resolve_session(
            root,
            PLATFORM,
            &incoming.channel_id,
            &actor_id,
            || chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            |sid| {
                let mut metadata =
                    crate::chat::history::new_metadata(sid, provider_name, model_name, None);
                crate::chat::history::save_metadata(&mut metadata)
            },
        )?;

        let actor = session::remote_actor(PLATFORM, &incoming.user_id, &session_id);
        session::record_request(
            root,
            &actor,
            PLATFORM,
            &incoming.channel_id,
            &session_id,
            &incoming.message_id,
        );

        crate::chat::history::append_user(&session_id, &incoming.content)
            .context("recording the incoming Discord message")?;

        let provider = try_select_provider(provider_name).map_err(anyhow::Error::msg)?;
        let api_key = if provider.requires_key() {
            std::env::var(provider.env_var())
                .ok()
                .filter(|k| !k.is_empty())
        } else {
            None
        };

        let history = crate::chat::history::load(&session_id)?;
        let system = "You are Yana, responding over Discord. Keep replies concise and \
            plain-text friendly for a chat client: short paragraphs, minimal markdown, \
            no wide tables or diagrams.";
        let start = std::time::Instant::now();
        let mut reply = String::new();
        let outcome = provider.stream_chat(
            api_key.as_deref(),
            model_name,
            Some(system),
            &history,
            &[], // no tools: this slice never grants capability access from Discord
            &mut |chunk| {
                reply.push_str(chunk);
                Ok(())
            },
        );
        let duration_ms = start.elapsed().as_millis() as u64;

        match outcome {
            Ok((usage, _stream_outcome)) => {
                crate::chat::history::append_assistant(
                    &session_id,
                    provider_name,
                    model_name,
                    &reply,
                    usage.input_tokens,
                    usage.output_tokens,
                    duration_ms,
                    false,
                    None,
                )?;
                Ok(reply)
            }
            Err(error) => {
                let message = format!("{error:#}");
                let _ = crate::chat::history::append_assistant(
                    &session_id,
                    provider_name,
                    model_name,
                    "",
                    0,
                    0,
                    duration_ms,
                    false,
                    Some(&message),
                );
                Err(error)
            }
        }
    }

    /// Run the Discord bot until it is killed. Blocking — intended to be
    /// the whole process (`yana-rt remote discord serve`), not a
    /// background task.
    pub fn serve(root: &Path, provider_name: &str, model_name: &str) -> Result<()> {
        let token = discord::bot_token()
            .context("DISCORD_BOT_TOKEN is not set — see `yana-rt remote discord setup`")?;
        let cfg = discord::load_config(root)?;
        if cfg.allowed_channel_ids.is_empty() {
            anyhow::bail!(
                "no allowed_channel_ids configured — see `yana-rt remote discord setup`; \
                 an empty allowlist denies every channel by design, so there is nothing to serve"
            );
        }
        // yana-rt's chat/session history API resolves its storage root from
        // the process's current directory, not an explicit parameter (a
        // pre-existing asymmetry with `os::state`'s explicit-root
        // functions, not introduced here) — pinning it once at startup, the
        // same way `git -C <path>` or `cargo --manifest-path` scope an
        // otherwise-cwd-relative tool, keeps every subsequent
        // `chat::history::*` call operating against the intended project
        // root for the life of this long-running process.
        std::env::set_current_dir(root)
            .with_context(|| format!("switching into {}", root.display()))?;
        let client = discord::Client::new(token.clone());
        let root = root.to_path_buf();
        let provider_name = provider_name.to_string();
        let model_name = model_name.to_string();
        discord::run_gateway(&token, &cfg, move |incoming: Incoming| {
            let channel_id = incoming.channel_id.clone();
            match handle_turn(&root, &provider_name, &model_name, &incoming) {
                Ok(reply) => {
                    for chunk in discord::chunk_reply(&reply, discord::MESSAGE_MAX) {
                        if let Err(error) = client.send_message(&channel_id, &chunk) {
                            eprintln!("[discord] failed to send reply: {error:#}");
                        }
                    }
                }
                Err(error) => {
                    eprintln!("[discord] turn failed: {error:#}");
                    let _ = client.send_message(
                        &channel_id,
                        "Sorry, something went wrong handling that message.",
                    );
                }
            }
        });
        Ok(())
    }

    /// `yana-rt remote discord test` — the live-verification step this
    /// program's evidence discipline requires before this adapter can be
    /// called LIVE VERIFIED rather than LOGIC TESTED. Needs a real bot
    /// token; not run in this development environment (see `discord.rs`'s
    /// module doc).
    pub fn test_connection() -> Result<()> {
        let token = discord::bot_token()
            .context("DISCORD_BOT_TOKEN is not set — see `yana-rt remote discord setup`")?;
        let client = discord::Client::new(token);
        let username = client.get_me()?;
        println!("Connected as {username}");
        Ok(())
    }

    pub fn setup_instructions() -> String {
        format!(
            "Discord setup:\n\
             1. Create an application at https://discord.com/developers/applications\n\
             2. Add a Bot user; enable the MESSAGE_CONTENT privileged intent\n\
             3. Invite it to your server with the bot scope + Send/Read Messages\n\
             4. export {}=<bot token>\n\
             5. Edit .yana-ai/os/discord-config.json — add the channel ids (and, \
                optionally, user ids) allowed to talk to it. An empty allowlist \
                denies everyone; this is the secure default, not a bug. Example:\n\
                   {{\"allowed_channel_ids\": [\"123456789012345678\"], \"allowed_user_ids\": []}}\n\
             6. yana-rt remote discord test   # verifies the token, no gateway connection\n\
             7. yana-rt remote discord serve  # runs the bot (blocking)",
            discord::bot_token_env_var_name()
        )
    }
}

#[cfg(feature = "discord")]
pub use dispatch::{serve, setup_instructions, test_connection};
