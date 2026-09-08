//! Connector permission registry.
//!
//! This is intentionally not an OAuth client. It establishes a reviewable
//! local allowlist before a future connector adapter can receive credentials
//! from the existing OS secret boundary. Tokens are never written here.

use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum ConnectorAction {
    /// List built-in connector types and locally enabled scopes
    List {
        #[arg(long)]
        json: bool,
    },
    /// Enable a connector with an explicit subset of its allowed scopes
    Enable {
        name: String,
        #[arg(long, value_delimiter = ',')]
        scope: Vec<String>,
    },
    /// Disable a connector locally; does not revoke a provider-side token
    Disable { name: String },
    /// Show one connector's local permission state
    Status {
        name: String,
        #[arg(long)]
        json: bool,
    },
    /// Read approved notifications into the local workspace; only GitHub is implemented
    Sync {
        name: String,
        #[arg(long, default_value_t = 20)]
        limit: usize,
        /// Fetch and classify without writing workspace events
        #[arg(long)]
        dry_run: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
struct Definition {
    name: &'static str,
    description: &'static str,
    allowed_scopes: &'static [&'static str],
    resource_kinds: &'static [&'static str],
    credential_key: &'static str,
    adapter_installed: bool,
}

const DEFINITIONS: &[Definition] = &[
    Definition {
        name: "gmail",
        description: "Email triage; read and draft permissions are separate",
        allowed_scopes: &["mail.read", "mail.draft"],
        resource_kinds: &["message", "thread", "attachment"],
        credential_key: "YANA_GMAIL_ACCESS_TOKEN",
        // Real adapter: tools/yana-web/connector-google-adapters.js's
        // fetchGmailMessages() calls gmail.googleapis.com for real — this
        // flag was stale from before that adapter existed, which made the
        // "Adapter unavailable" badge lie about a connector that actually
        // works once OAuth is configured (see integrations-settings.jsx).
        adapter_installed: true,
    },
    Definition {
        name: "google-calendar",
        description: "Calendar visibility and edits are separately scoped",
        allowed_scopes: &["calendar.read", "calendar.write"],
        resource_kinds: &["calendar", "event"],
        credential_key: "YANA_GOOGLE_CALENDAR_ACCESS_TOKEN",
        // Real adapter: connector-google-adapters.js's fetchCalendarEvents()
        // calls www.googleapis.com/calendar/v3 for real — same stale-flag
        // fix as gmail above.
        adapter_installed: true,
    },
    Definition {
        name: "github",
        description: "Repository notifications and issue triage",
        allowed_scopes: &["repo.read", "issue.write"],
        resource_kinds: &["repository", "notification", "issue", "pull-request"],
        credential_key: "YANA_GITHUB_ACCESS_TOKEN",
        adapter_installed: true,
    },
    Definition {
        name: "notion",
        description: "Workspace research documents",
        allowed_scopes: &["page.read", "page.write"],
        resource_kinds: &["page", "database"],
        credential_key: "YANA_NOTION_ACCESS_TOKEN",
        // Real adapter: tools/yana-web/connector-notion-adapter.js's
        // fetchNotionPages() calls Notion's /v1/search for real (read
        // only — page.write above is declared but not yet implemented,
        // same precedent as gmail's mail.draft).
        adapter_installed: true,
    },
    Definition {
        name: "google-drive",
        description: "Drive document discovery",
        allowed_scopes: &["drive.read"],
        resource_kinds: &["file", "folder"],
        credential_key: "YANA_GOOGLE_DRIVE_ACCESS_TOKEN",
        // Real adapter added alongside this connector's OAuth wiring:
        // connector-google-adapters.js's fetchDriveFiles() calls
        // drive.readonly's files.list for real, same pattern as gmail/
        // google-calendar above.
        adapter_installed: true,
    },
    Definition {
        name: "slack",
        description: "Workspace channel discovery",
        allowed_scopes: &["channel.read"],
        resource_kinds: &["channel"],
        credential_key: "YANA_SLACK_ACCESS_TOKEN",
        // Real adapter: tools/yana-web/connector-slack-adapter.js's
        // fetchSlackChannels() calls conversations.list for real. Added
        // together with its Definition entry — unlike gmail/notion/
        // google-drive above, slack never had a stale pre-OAuth stub
        // here; this is its first appearance in the registry at all.
        adapter_installed: true,
    },
    Definition {
        name: "figma",
        description: "Design file identity — no generic file listing exists",
        allowed_scopes: &["file.read"],
        resource_kinds: &["file"],
        credential_key: "YANA_FIGMA_ACCESS_TOKEN",
        // Honestly false, not stale: OAuth Connect/Disconnect is real
        // (tools/yana-web/figma-oauth.js), but there is deliberately no
        // connector-figma-adapter.js — Figma's REST API has no generic
        // "list my recent files" endpoint without a pre-known team_id
        // (see figma-oauth.js's header comment). Flip this to true only
        // once a real adapter exists, same as every other connector here.
        adapter_installed: false,
    },
    Definition {
        name: "canva",
        description: "Design discovery",
        allowed_scopes: &["design.read"],
        resource_kinds: &["design"],
        credential_key: "YANA_CANVA_ACCESS_TOKEN",
        // Real adapter: tools/yana-web/connector-canva-adapter.js's
        // fetchCanvaDesigns() calls /rest/v1/designs for real.
        adapter_installed: true,
    },
];

#[derive(Debug, Default, Serialize, Deserialize)]
struct ConnectorStore {
    #[serde(default)]
    enabled: Vec<EnabledConnector>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EnabledConnector {
    name: String,
    scopes: Vec<String>,
    enabled_at: String,
}

#[derive(Debug, Deserialize)]
struct GitHubNotification {
    id: String,
    reason: String,
    updated_at: String,
    repository: GitHubRepository,
    subject: GitHubSubject,
}

#[derive(Debug, Deserialize)]
struct GitHubRepository {
    full_name: String,
}

#[derive(Debug, Deserialize)]
struct GitHubSubject {
    title: String,
    #[serde(rename = "type")]
    kind: String,
}

fn path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai")
        .join("connectors.json")
}

fn definition(name: &str) -> Option<&'static Definition> {
    DEFINITIONS.iter().find(|item| item.name == name)
}

fn load() -> Result<ConnectorStore, String> {
    let file = path();
    if !file.exists() {
        return Ok(ConnectorStore::default());
    }
    serde_json::from_str(&fs::read_to_string(file).map_err(|e| e.to_string())?)
        .map_err(|e| format!("connector registry is invalid JSON: {e}"))
}

fn save(store: &ConnectorStore) -> Result<(), String> {
    let file = path();
    fs::create_dir_all(file.parent().expect("connector path has parent"))
        .map_err(|e| e.to_string())?;
    let temp = file.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(
        &temp,
        serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, file).map_err(|e| e.to_string())
}

fn validate_scopes(definition: &Definition, scopes: &[String]) -> Result<(), String> {
    if scopes.is_empty() {
        return Err("at least one --scope is required".into());
    }
    for scope in scopes {
        if !definition.allowed_scopes.contains(&scope.as_str()) {
            return Err(format!(
                "scope '{scope}' is not allowed for {}; allowed: {}",
                definition.name,
                definition.allowed_scopes.join(", ")
            ));
        }
    }
    Ok(())
}

/// Presence only: a connector registry must never print or persist a token.
fn credential_present(definition: &Definition) -> bool {
    use crate::os::platform::contract::SecretBackend;
    std::env::var(definition.credential_key).is_ok_and(|value| !value.is_empty())
        || crate::os::platform::secret_backend()
            .has_entry(definition.credential_key)
            .unwrap_or(false)
}

fn runtime_credential_available(definition: &Definition) -> bool {
    std::env::var(definition.credential_key).is_ok_and(|value| !value.is_empty())
}

fn connection_state(
    definition: &Definition,
    enabled: Option<&EnabledConnector>,
    runtime_credential_available: bool,
) -> &'static str {
    if enabled.is_none() {
        "disabled"
    } else if !definition.adapter_installed {
        "adapter-unavailable"
    } else if !runtime_credential_available {
        "credential-required"
    } else {
        "ready"
    }
}

fn connector_json(
    definition: &Definition,
    enabled: Option<&EnabledConnector>,
) -> serde_json::Value {
    let credential_present = credential_present(definition);
    let runtime_credential_available = runtime_credential_available(definition);
    serde_json::json!({
        "name": definition.name,
        "description": definition.description,
        "allowed_scopes": definition.allowed_scopes,
        "enabled_scopes": enabled.map(|item| &item.scopes),
        "enabled_at": enabled.map(|item| &item.enabled_at),
        "resource_kinds": definition.resource_kinds,
        "credential_present": credential_present,
        "runtime_credential_available": runtime_credential_available,
        "authorization_mode": "os-secret-or-environment",
        "adapter_installed": definition.adapter_installed,
        "connection_state": connection_state(definition, enabled, runtime_credential_available),
    })
}

pub fn dispatch(action: ConnectorAction) {
    let result = match action {
        ConnectorAction::List { json } => cmd_list(json),
        ConnectorAction::Enable { name, scope } => cmd_enable(&name, scope),
        ConnectorAction::Disable { name } => cmd_disable(&name),
        ConnectorAction::Status { name, json } => cmd_status(&name, json),
        ConnectorAction::Sync {
            name,
            limit,
            dry_run,
        } => cmd_sync(&name, limit, dry_run),
    };
    if let Err(error) = result {
        eprintln!("yana-rt connector: {error}");
        std::process::exit(2);
    }
}

fn cmd_list(json: bool) -> Result<(), String> {
    let store = load()?;
    if json {
        let rows: Vec<_> = DEFINITIONS
            .iter()
            .map(|definition| {
                connector_json(
                    definition,
                    store
                        .enabled
                        .iter()
                        .find(|item| item.name == definition.name),
                )
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?
        );
        return Ok(());
    }
    for definition in DEFINITIONS {
        let enabled = store
            .enabled
            .iter()
            .find(|item| item.name == definition.name)
            .map(|item| item.scopes.join(", "))
            .unwrap_or_else(|| "disabled".into());
        println!(
            "{:<18} {}\n  allowed: {}\n  credential: {} · adapter: {}",
            definition.name,
            enabled,
            definition.allowed_scopes.join(", "),
            if credential_present(definition) {
                "present"
            } else {
                "absent"
            },
            if definition.adapter_installed {
                "installed"
            } else {
                "not installed"
            }
        );
    }
    Ok(())
}

fn cmd_enable(name: &str, scopes: Vec<String>) -> Result<(), String> {
    let definition = definition(name).ok_or_else(|| format!("unknown connector '{name}'"))?;
    validate_scopes(definition, &scopes)?;
    let mut store = load()?;
    store.enabled.retain(|item| item.name != name);
    store.enabled.push(EnabledConnector {
        name: name.into(),
        scopes: scopes.clone(),
        enabled_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    });
    save(&store)?;
    println!("enabled {name}: {}\ncredentials: not stored here; configure through the OS secret provider before use", scopes.join(", "));
    Ok(())
}

fn cmd_disable(name: &str) -> Result<(), String> {
    definition(name).ok_or_else(|| format!("unknown connector '{name}'"))?;
    let mut store = load()?;
    let old_len = store.enabled.len();
    store.enabled.retain(|item| item.name != name);
    if old_len == store.enabled.len() {
        println!("{name} is already disabled");
        return Ok(());
    }
    save(&store)?;
    println!("disabled {name}; any provider-side credential remains unchanged");
    Ok(())
}

fn cmd_status(name: &str, json: bool) -> Result<(), String> {
    let definition = definition(name).ok_or_else(|| format!("unknown connector '{name}'"))?;
    let enabled = load()?.enabled.into_iter().find(|item| item.name == name);
    let credential_present = credential_present(definition);
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&connector_json(definition, enabled.as_ref()))
                .map_err(|e| e.to_string())?
        );
    } else if let Some(enabled) = enabled {
        println!(
            "{} enabled since {}\nscopes: {}\ncredential: {}\nadapter: {}",
            definition.name,
            enabled.enabled_at,
            enabled.scopes.join(", "),
            if credential_present {
                "present"
            } else {
                "absent"
            },
            if definition.adapter_installed {
                "installed"
            } else {
                "not installed"
            }
        );
    } else {
        println!(
            "{} disabled\nallowed scopes: {}\ncredential: {}\nadapter: {}",
            definition.name,
            definition.allowed_scopes.join(", "),
            if credential_present {
                "present"
            } else {
                "absent"
            },
            if definition.adapter_installed {
                "installed"
            } else {
                "not installed"
            }
        );
    }
    Ok(())
}

fn enabled_scopes(name: &str) -> Result<Vec<String>, String> {
    load()?
        .enabled
        .into_iter()
        .find(|item| item.name == name)
        .map(|item| item.scopes)
        .ok_or_else(|| format!("{name} is disabled; enable an explicit read scope first"))
}

fn notification_title(notification: &GitHubNotification) -> String {
    format!(
        "[GitHub:{}] {}",
        notification.repository.full_name, notification.subject.title
    )
}

/// The first concrete connector adapter. It uses a request the user invoked,
/// is read-only at GitHub, and creates only local workspace blocks. Other
/// registry entries intentionally return an error until their own adapter is
/// implemented rather than silently pretending to synchronize.
fn cmd_sync(name: &str, limit: usize, dry_run: bool) -> Result<(), String> {
    if name != "github" {
        return Err(format!("no read adapter is installed for '{name}'"));
    }
    if limit == 0 {
        return Err("limit must be at least 1".into());
    }
    let scopes = enabled_scopes(name)?;
    if !scopes.iter().any(|scope| scope == "repo.read") {
        return Err("github sync requires the explicit repo.read scope".into());
    }
    let token = std::env::var("YANA_GITHUB_ACCESS_TOKEN")
        .map_err(|_| "YANA_GITHUB_ACCESS_TOKEN is not set; this adapter reads tokens from the environment only".to_string())?;
    if token.is_empty() {
        return Err("YANA_GITHUB_ACCESS_TOKEN is empty".into());
    }
    let page_size = limit.min(50);
    let mut response = ureq::get(&format!(
        "https://api.github.com/notifications?per_page={page_size}"
    ))
    .header("Accept", "application/vnd.github+json")
    .header("X-GitHub-Api-Version", "2022-11-28")
    .header("User-Agent", "yana-rt connector")
    .header("Authorization", format!("Bearer {token}"))
    .call()
    .map_err(|error| match error {
        ureq::Error::StatusCode(401) => "GitHub rejected YANA_GITHUB_ACCESS_TOKEN (401)".into(),
        ureq::Error::StatusCode(403) => {
            "GitHub denied notification access (403); check token permissions".into()
        }
        ureq::Error::StatusCode(429) => "GitHub rate limit reached (429)".into(),
        other => format!("GitHub notification request failed: {other}"),
    })?;
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|error| format!("reading GitHub response: {error}"))?;
    let notifications: Vec<GitHubNotification> = serde_json::from_str(&body)
        .map_err(|error| format!("parsing GitHub notification response: {error}"))?;
    let root = std::env::current_dir().map_err(|error| error.to_string())?;
    let service =
        crate::workspace::WorkspaceService::new(crate::workspace::FileEventStore::new(&root));
    let state = service.state()?;
    let mut known_titles: HashSet<String> = state
        .blocks
        .values()
        .map(|block| block.title.clone())
        .collect();
    let mut added = 0usize;
    let mut existing = 0usize;
    for notification in notifications.into_iter().take(limit) {
        let title = notification_title(&notification);
        if !known_titles.insert(title.clone()) {
            existing += 1;
            continue;
        }
        let decision = crate::workspace::triage(&format!("{title}\n{}", notification.reason));
        if !dry_run {
            let metadata = BTreeMap::from([
                ("connector".into(), "github".into()),
                ("external_id".into(), notification.id.clone()),
                (
                    "repository".into(),
                    notification.repository.full_name.clone(),
                ),
                (
                    "resource_kind".into(),
                    notification.subject.kind.to_ascii_lowercase(),
                ),
                ("source_updated_at".into(), notification.updated_at.clone()),
            ]);
            service.execute(crate::workspace::WorkspaceOperation::CreateBlock {
                kind: if notification.subject.kind == "PullRequest" {
                    crate::workspace::BlockKind::PullRequest
                } else {
                    crate::workspace::BlockKind::Message
                },
                title,
                body: format!(
                    "GitHub {} notification {}\nReason: {}\nUpdated: {}",
                    notification.subject.kind,
                    notification.id,
                    notification.reason,
                    notification.updated_at
                ),
                attention: decision.attention,
                actor: "connector:github".into(),
                metadata,
            })?;
        }
        added += 1;
    }
    println!(
        "github notifications: {} {} · {existing} already present",
        added,
        if dry_run { "would be added" } else { "added" }
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permissions_require_explicit_known_scope() {
        let gmail = definition("gmail").unwrap();
        assert!(validate_scopes(gmail, &["mail.read".into()]).is_ok());
        assert!(validate_scopes(gmail, &["mail.delete".into()]).is_err());
        assert!(validate_scopes(gmail, &[]).is_err());
    }

    #[test]
    fn connector_names_are_fixed_allowlist() {
        assert!(definition("github").is_some());
        assert!(definition("shell").is_none());
    }

    #[test]
    fn every_connector_has_a_distinct_nonempty_credential_key() {
        let mut keys: Vec<_> = DEFINITIONS
            .iter()
            .map(|definition| definition.credential_key)
            .collect();
        assert!(keys.iter().all(|key| !key.is_empty()));
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), DEFINITIONS.len());
    }

    #[test]
    fn github_title_is_stable_for_workspace_deduplication() {
        let notification = GitHubNotification {
            id: "42".into(),
            reason: "mention".into(),
            updated_at: "2026-08-27T00:00:00Z".into(),
            repository: GitHubRepository {
                full_name: "org/yana".into(),
            },
            subject: GitHubSubject {
                title: "Review policy".into(),
                kind: "PullRequest".into(),
            },
        };
        assert_eq!(
            notification_title(&notification),
            "[GitHub:org/yana] Review policy"
        );
    }

    #[test]
    fn connector_state_never_claims_an_uninstalled_adapter_is_ready() {
        // A synthetic Definition, not a real one looked up from
        // DEFINITIONS: every real connector's adapter_installed has been
        // true since the google-drive/notion adapters landed (gmail and
        // google-calendar flipped first, when this test's fixture was
        // "gmail" and broke for the same reason), so pinning this test to
        // whichever real connector is currently uninstalled is fragile —
        // it broke twice in one session. This tests connection_state()'s
        // own logic in isolation instead, independent of the real
        // registry's current adapter-rollout state.
        let uninstalled = Definition {
            name: "synthetic-uninstalled",
            description: "test fixture only",
            allowed_scopes: &["x.read"],
            resource_kinds: &["thing"],
            credential_key: "YANA_SYNTHETIC_ACCESS_TOKEN",
            adapter_installed: false,
        };
        let enabled = EnabledConnector {
            name: "synthetic-uninstalled".into(),
            scopes: vec!["x.read".into()],
            enabled_at: "now".into(),
        };
        assert_eq!(
            connection_state(&uninstalled, Some(&enabled), true),
            "adapter-unavailable"
        );
    }

    #[test]
    fn connector_state_requires_a_runtime_usable_credential() {
        let github = definition("github").unwrap();
        let enabled = EnabledConnector {
            name: "github".into(),
            scopes: vec!["repo.read".into()],
            enabled_at: "now".into(),
        };
        assert_eq!(
            connection_state(github, Some(&enabled), false),
            "credential-required"
        );
        assert_eq!(connection_state(github, Some(&enabled), true), "ready");
    }
}
