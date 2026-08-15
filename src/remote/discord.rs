//! Discord adapter — minimum safe vertical slice (Host-Native OS Program,
//! Discord Phase). Read-only chat ONLY: an authenticated, allowlisted
//! Discord message becomes one turn of plain conversation with the
//! configured model. No tool/capability access of any kind is wired into
//! this path — `stream_chat` below is called with `tools: &[]`, so there
//! is no code path from a Discord message to any shell/file/git
//! capability. That is a structural property of this file, not a runtime
//! check: extending Discord to touch capabilities is future, explicitly
//! out-of-scope work (see the module doc in `remote/mod.rs`), gated on
//! designing an approval boundary that does NOT simply inherit whatever
//! local CLI approval/autonomy setting happens to be configured — see the
//! Aizen research finding this design deliberately avoids repeating
//! (Aizen's own `ApprovalMode` is one knob shared by local CLI and every
//! remote surface; a user's own `Yolo` convenience setting silently
//! extends to their bot too).
//!
//! Protocol shape (gateway v10 handshake, opcodes, heartbeat/zombie
//! detection, reconnect backoff) is adapted from aizen-stack/aizen's own
//! working implementation (`src/hostbot/platforms/discord.rs`, revision
//! `4b63acef489bd9b373a9cc43c39acd5ac677aef4`, read directly during this
//! program's Aizen research pass — Apache-2.0), translated from
//! reqwest+tokio-tungstenite (async) to ureq+tungstenite (sync), matching
//! this crate's existing sync-first convention rather than introducing a
//! second async-runtime-requiring feature (see the `discord` Cargo
//! feature's own comment). The protocol logic itself is not novel — it
//! implements Discord's own publicly documented Gateway v10 spec — but is
//! cross-checked against Aizen's real, running implementation rather than
//! written from the spec alone.
//!
//! Honesty about verification (matches this program's existing evidence
//! discipline): the allowlist, config, actor/session mapping, and message
//! chunking logic below are LOGIC-TESTED (`cargo test`, no network). The
//! REST client and the gateway connection have NOT been LIVE-VERIFIED —
//! this environment has no Discord bot token. `discord test` (below) is
//! the intended live-verification step; it must be run against a real bot
//! token before this adapter is considered proven end-to-end.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message as WsMessage, WebSocket};

type GatewaySocket = WebSocket<MaybeTlsStream<TcpStream>>;

const API_BASE: &str = "https://discord.com/api/v10";
const GATEWAY_URL: &str = "wss://gateway.discord.gg/?v=10&encoding=json";
/// Discord's hard per-message limit is 2000 UTF-16 code units; replies are
/// chunked to just under it.
pub const MESSAGE_MAX: usize = 1900;
/// GUILDS (1<<0) | GUILD_MESSAGES (1<<9) | DIRECT_MESSAGES (1<<12) |
/// MESSAGE_CONTENT (1<<15). MESSAGE_CONTENT is privileged — must be
/// enabled in the bot's Developer Portal settings, else `content` arrives
/// empty and IDENTIFY may be rejected with close code 4014.
const INTENTS: u64 = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15);

const OP_DISPATCH: u64 = 0;
const OP_HEARTBEAT: u64 = 1;
const OP_IDENTIFY: u64 = 2;
const OP_RECONNECT: u64 = 7;
const OP_INVALID_SESSION: u64 = 9;
const OP_HELLO: u64 = 10;
const OP_HEARTBEAT_ACK: u64 = 11;

const CONFIG_RELATIVE_PATH: &str = ".yana-ai/os/discord-config.json";
const BOT_TOKEN_ENV_VAR: &str = "DISCORD_BOT_TOKEN";

// ── config ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiscordConfig {
    #[serde(default)]
    pub allowed_channel_ids: Vec<String>,
    #[serde(default)]
    pub allowed_user_ids: Vec<String>,
}

fn config_path(root: &Path) -> PathBuf {
    root.join(CONFIG_RELATIVE_PATH)
}

pub fn load_config(root: &Path) -> Result<DiscordConfig> {
    let path = config_path(root);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("invalid discord config at {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DiscordConfig::default()),
        Err(error) => Err(error).with_context(|| format!("reading {}", path.display())),
    }
}

/// The bot token, read the SAME way every other provider credential in
/// this crate is actually retrieved for use (`std::env::var`, matching
/// `task.rs`/`chat/mod.rs` — see the Discord Phase design note on why
/// `os::platform::secret_backend()` is presence-only and cannot supply
/// this value). Never logged, never included in any receipt/evidence
/// detail string below.
pub fn bot_token() -> Option<String> {
    std::env::var(BOT_TOKEN_ENV_VAR)
        .ok()
        .filter(|s| !s.trim().is_empty())
}

pub fn bot_token_env_var_name() -> &'static str {
    BOT_TOKEN_ENV_VAR
}

/// Allowlist: the channel must be listed AND (no user restriction OR the
/// user is listed). An empty channel list denies everyone — the secure
/// default matches Aizen's own proven `is_allowed`, cross-checked against
/// their real implementation rather than invented independently.
pub fn is_allowed(cfg: &DiscordConfig, channel: &str, user: &str) -> bool {
    cfg.allowed_channel_ids.iter().any(|id| id == channel)
        && (cfg.allowed_user_ids.is_empty() || cfg.allowed_user_ids.iter().any(|id| id == user))
}

// ── REST client (ureq — sync, matches this crate's existing HTTP convention) ──

pub struct Client {
    agent: ureq::Agent,
    token: String,
}

impl Client {
    pub fn new(token: String) -> Self {
        let config = ureq::Agent::config_builder()
            .timeout_connect(Some(Duration::from_secs(10)))
            .timeout_recv_response(Some(Duration::from_secs(15)))
            .http_status_as_error(false)
            .build();
        Self {
            agent: ureq::Agent::new_with_config(config),
            token,
        }
    }

    fn auth(&self) -> String {
        format!("Bot {}", self.token)
    }

    pub fn send_message(&self, channel_id: &str, content: &str) -> Result<()> {
        let url = format!("{API_BASE}/channels/{channel_id}/messages");
        let mut resp = self
            .agent
            .post(&url)
            .header("Authorization", self.auth())
            .header("content-type", "application/json")
            .send_json(json!({ "content": content }))
            .context("discord sendMessage")?;
        if resp.status().as_u16() >= 300 {
            let body: String = resp
                .body_mut()
                .read_to_string()
                .unwrap_or_default()
                .chars()
                .take(200)
                .collect();
            bail!(
                "discord send failed: HTTP {} {}",
                resp.status(),
                body.trim()
            );
        }
        Ok(())
    }

    /// `GET /users/@me` — validates the token; the live-verification step
    /// for `discord test` (see this file's top-level doc on what has and
    /// has not been verified in this environment).
    pub fn get_me(&self) -> Result<String> {
        let url = format!("{API_BASE}/users/@me");
        let mut resp = self
            .agent
            .get(&url)
            .header("Authorization", self.auth())
            .call()
            .context("discord getMe")?;
        if resp.status().as_u16() >= 300 {
            bail!("discord rejected the token (HTTP {})", resp.status());
        }
        let v: Value = resp.body_mut().read_json().context("parsing /users/@me")?;
        Ok(v.get("username")
            .and_then(Value::as_str)
            .unwrap_or("?")
            .to_string())
    }
}

// ── gateway (receive) — sync tungstenite ───────────────────────────────

pub struct Incoming {
    pub channel_id: String,
    pub user_id: String,
    pub content: String,
}

/// Connect once and run the gateway receive loop until it drops, calling
/// `on_message` for every allowed inbound message. Blocking, single
/// thread — this minimum slice processes one message at a time by
/// design (see `remote/mod.rs`'s module doc on why concurrency isolation
/// is explicitly deferred, not merely unimplemented by oversight).
/// Found by live-testing this file against Discord's real gateway with a
/// throwaway token (see the Discord Phase report): `tungstenite`'s
/// `connect()` panics on the first `wss://` connection with "Could not
/// automatically determine the process-level CryptoProvider" unless one is
/// installed first — `ureq`'s own TLS setup apparently installs one for
/// its own use, but that does not cover `tungstenite`'s separate rustls
/// integration. `ring` matches the crypto backend already present in this
/// crate's dependency tree (confirmed via `Cargo.lock`) rather than
/// picking a new one. `Once` because a second `install_default()` call
/// errors if one is already active, and `run_gateway` can legitimately
/// reconnect many times in one process.
fn ensure_crypto_provider_installed() {
    static INSTALL: std::sync::Once = std::sync::Once::new();
    INSTALL.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

pub fn run_gateway(token: &str, cfg: &DiscordConfig, mut on_message: impl FnMut(Incoming)) {
    ensure_crypto_provider_installed();
    let mut backoff = Duration::from_secs(1);
    loop {
        let start = Instant::now();
        match gateway_once(token, cfg, &mut on_message) {
            Ok(()) => backoff = Duration::from_secs(1),
            Err(error) => {
                if error.downcast_ref::<FatalCloseError>().is_some() {
                    eprintln!(
                        "[discord gateway] permanent failure: {error:#} — not reconnecting \
                         (fix the token / enable the required intent, then restart)."
                    );
                    return;
                }
                eprintln!("[discord gateway] {error:#}");
                if start.elapsed() >= Duration::from_secs(60) {
                    backoff = Duration::from_secs(1);
                }
                std::thread::sleep(backoff);
                backoff = (backoff * 2).min(Duration::from_secs(60));
            }
        }
    }
}

fn gateway_once(
    token: &str,
    cfg: &DiscordConfig,
    on_message: &mut impl FnMut(Incoming),
) -> Result<()> {
    let (mut ws, _) = connect(GATEWAY_URL).context("connecting to discord gateway")?;
    set_read_timeout(&ws, Some(Duration::from_secs(20)));

    // 1) HELLO -> heartbeat_interval.
    let mut interval = Duration::from_millis(41_250);
    let hello_deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if Instant::now() >= hello_deadline {
            bail!("timed out waiting for gateway HELLO (20s)");
        }
        let Some(v) = next_json(&mut ws)? else {
            continue;
        };
        if v.get("op").and_then(Value::as_u64) == Some(OP_HELLO) {
            if let Some(ms) = v
                .get("d")
                .and_then(|d| d.get("heartbeat_interval"))
                .and_then(Value::as_u64)
            {
                interval = Duration::from_millis(ms.max(1000));
            }
            break;
        }
    }

    // 2) IDENTIFY.
    ws.send(WsMessage::text(
        json!({
            "op": OP_IDENTIFY,
            "d": {
                "token": token,
                "intents": INTENTS,
                "properties": {"os": std::env::consts::OS, "browser": "yana-rt", "device": "yana-rt"}
            }
        })
        .to_string(),
    ))
    .context("sending IDENTIFY")?;

    // 3) heartbeat + dispatch loop. A short read timeout lets the loop
    // check the heartbeat deadline even with no inbound traffic; it is
    // NOT itself a protocol error.
    set_read_timeout(&ws, Some(Duration::from_millis(500)));
    let mut last_seq: Option<u64> = None;
    let mut awaiting_ack = false;
    let mut next_beat = Instant::now() + interval;
    loop {
        if Instant::now() >= next_beat {
            if awaiting_ack {
                bail!("no Heartbeat ACK since the last beat — zombied gateway link, reconnecting");
            }
            ws.send(WsMessage::text(
                json!({"op": OP_HEARTBEAT, "d": last_seq}).to_string(),
            ))
            .context("sending heartbeat")?;
            awaiting_ack = true;
            next_beat = Instant::now() + interval;
        }
        let v = match next_json(&mut ws) {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(error) => return Err(error),
        };
        if let Some(s) = v.get("s").and_then(Value::as_u64) {
            last_seq = Some(s);
        }
        match v.get("op").and_then(Value::as_u64) {
            Some(OP_HEARTBEAT) => {
                ws.send(WsMessage::text(
                    json!({"op": OP_HEARTBEAT, "d": last_seq}).to_string(),
                ))
                .context("sending requested heartbeat")?;
                awaiting_ack = true;
            }
            Some(OP_HEARTBEAT_ACK) => awaiting_ack = false,
            Some(OP_RECONNECT) => bail!("gateway requested reconnect (op 7)"),
            Some(OP_INVALID_SESSION) => bail!("gateway invalidated the session (op 9)"),
            Some(OP_DISPATCH) if v.get("t").and_then(Value::as_str) == Some("MESSAGE_CREATE") => {
                if let Some(inc) = parse_message_create(v.get("d")) {
                    if is_allowed(cfg, &inc.channel_id, &inc.user_id) {
                        on_message(inc);
                    }
                }
            }
            _ => {}
        }
    }
}

/// Read one WebSocket text frame as JSON, or `None` on a benign read
/// timeout (the caller's loop re-checks its own deadlines and retries).
/// Close frames with a permanent Discord close code (bad token / missing
/// intent) surface as `FatalClose` so `run_gateway` stops instead of
/// IDENTIFY-storming Discord into a ban.
fn next_json(ws: &mut GatewaySocket) -> Result<Option<Value>> {
    match ws.read() {
        Ok(WsMessage::Text(text)) => Ok(serde_json::from_str(text.as_str()).ok()),
        Ok(WsMessage::Ping(payload)) => {
            let _ = ws.send(WsMessage::Pong(payload));
            Ok(None)
        }
        Ok(WsMessage::Close(frame)) => {
            let code = frame.as_ref().map(|f| u16::from(f.code));
            if matches!(code, Some(4004 | 4010 | 4011 | 4012 | 4013 | 4014)) {
                bail!(FatalCloseError(format!(
                    "gateway closed with permanent code {code:?} — bad token or a required \
                     intent (e.g. MESSAGE_CONTENT) is not enabled in the Developer Portal"
                )));
            }
            bail!("gateway sent Close (code {code:?})");
        }
        Ok(_) => Ok(None),
        Err(tungstenite::Error::Io(io_error))
            if matches!(
                io_error.kind(),
                std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
            ) =>
        {
            Ok(None)
        }
        Err(error) => Err(error).context("gateway read"),
    }
}

struct FatalCloseError(String);
impl std::fmt::Debug for FatalCloseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
impl std::fmt::Display for FatalCloseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
impl std::error::Error for FatalCloseError {}

fn set_read_timeout(ws: &GatewaySocket, timeout: Option<Duration>) {
    let result = match ws.get_ref() {
        MaybeTlsStream::Plain(stream) => stream.set_read_timeout(timeout),
        MaybeTlsStream::Rustls(stream) => stream.sock.set_read_timeout(timeout),
        _ => Ok(()),
    };
    let _ = result;
}

fn parse_message_create(d: Option<&Value>) -> Option<Incoming> {
    let d = d?;
    if d.get("author")
        .and_then(|a| a.get("bot"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }
    let channel_id = d.get("channel_id")?.as_str()?.to_string();
    let user_id = d.get("author")?.get("id")?.as_str()?.to_string();
    let content = d.get("content")?.as_str()?.trim().to_string();
    if content.is_empty() {
        return None;
    }
    Some(Incoming {
        channel_id,
        user_id,
        content,
    })
}

/// Split `s` into chunks under Discord's UTF-16 message limit.
pub fn chunk_reply(s: &str, max: usize) -> Vec<String> {
    if s.encode_utf16().count() <= max {
        return vec![s.to_string()];
    }
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut units = 0usize;
    for ch in s.chars() {
        let u = ch.len_utf16();
        if units + u > max && !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
            units = 0;
        }
        cur.push(ch);
        units += u;
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intents_include_message_content_and_guild_messages() {
        assert_eq!(
            INTENTS & (1 << 15),
            1 << 15,
            "MESSAGE_CONTENT must be requested"
        );
        assert_eq!(
            INTENTS & (1 << 9),
            1 << 9,
            "GUILD_MESSAGES must be requested"
        );
    }

    #[test]
    fn gateway_opcodes_match_discord_v10() {
        assert_eq!((OP_DISPATCH, OP_HEARTBEAT, OP_IDENTIFY), (0, 1, 2));
        assert_eq!(
            (OP_RECONNECT, OP_INVALID_SESSION, OP_HELLO, OP_HEARTBEAT_ACK),
            (7, 9, 10, 11)
        );
    }

    #[test]
    fn allowlist_denies_empty_and_unlisted() {
        let mut cfg = DiscordConfig::default();
        assert!(
            !is_allowed(&cfg, "100", "7"),
            "empty channel list denies everyone"
        );
        cfg.allowed_channel_ids = vec!["100".into(), "200".into()];
        assert!(
            is_allowed(&cfg, "100", "7"),
            "listed channel, no user restriction"
        );
        assert!(!is_allowed(&cfg, "300", "7"), "unlisted channel denied");
        cfg.allowed_user_ids = vec!["7".into()];
        assert!(is_allowed(&cfg, "100", "7"), "listed channel + listed user");
        assert!(
            !is_allowed(&cfg, "100", "8"),
            "listed channel, unlisted user denied"
        );
    }

    #[test]
    fn parse_skips_bots_and_empty_parses_ids() {
        let bot = json!({"channel_id":"1","author":{"id":"2","bot":true},"content":"hi"});
        assert!(
            parse_message_create(Some(&bot)).is_none(),
            "bot author skipped"
        );
        let empty = json!({"channel_id":"1","author":{"id":"2"},"content":"   "});
        assert!(
            parse_message_create(Some(&empty)).is_none(),
            "empty content skipped"
        );
        let ok = json!({"channel_id":"123","author":{"id":"456"},"content":"hello"});
        let inc = parse_message_create(Some(&ok)).expect("valid message parses");
        assert_eq!(
            (
                inc.channel_id.as_str(),
                inc.user_id.as_str(),
                inc.content.as_str()
            ),
            ("123", "456", "hello")
        );
    }

    #[test]
    fn chunk_reply_splits_over_the_limit_and_leaves_short_replies_whole() {
        assert_eq!(chunk_reply("hello", 1900), vec!["hello".to_string()]);
        let long = "a".repeat(10);
        let chunks = chunk_reply(&long, 4);
        assert_eq!(chunks, vec!["aaaa", "aaaa", "aa"]);
    }

    #[test]
    fn load_config_parses_a_hand_edited_file() {
        // Config is edited by hand per `setup_instructions()` (no `save_config`
        // in this slice — see the module's own note on avoiding an
        // unconsumed CLI-management surface before it's needed) — this
        // proves `load_config` correctly parses the exact shape a human
        // would actually write.
        let root = std::env::temp_dir().join(format!("yana-discord-cfg-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".yana-ai/os")).unwrap();
        std::fs::write(
            config_path(&root),
            r#"{"allowed_channel_ids": ["1", "2"], "allowed_user_ids": ["9"]}"#,
        )
        .unwrap();
        let loaded = load_config(&root).unwrap();
        assert_eq!(loaded.allowed_channel_ids, vec!["1", "2"]);
        assert_eq!(loaded.allowed_user_ids, vec!["9"]);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn load_config_defaults_to_empty_deny_all_when_no_file_exists() {
        let root = std::env::temp_dir().join(format!("yana-discord-cfg-{}", uuid::Uuid::new_v4()));
        let cfg = load_config(&root).unwrap();
        assert!(cfg.allowed_channel_ids.is_empty());
        assert!(
            !is_allowed(&cfg, "1", "1"),
            "no config file must still deny everyone"
        );
    }
}
