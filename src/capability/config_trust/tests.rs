use super::*;
use std::io::BufRead;
use std::path::PathBuf;

const SEARCH: &str = r#"{"endpoint":"https://s.example/q"}"#;

struct Fixture {
    _outer: tempfile::TempDir,
    root: PathBuf,
    store: PathBuf,
}

fn fixture() -> Fixture {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("repo");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::write(root.join(".yana-ai/web-search.json"), SEARCH).unwrap();
    std::fs::write(root.join(".yana-ai/mcp-servers.json"), r#"{"servers":[]}"#).unwrap();
    std::fs::write(root.join(".yana-ai/lsp-servers.json"), r#"{"servers":[]}"#).unwrap();
    let store = outer.path().join("trust-store");
    Fixture { _outer: outer, root, store }
}

fn rewrite(fx: &Fixture, file: &str, text: &str) {
    std::fs::write(fx.root.join(".yana-ai").join(file), text).unwrap();
}

#[test]
fn a_configuration_nobody_confirmed_is_not_trusted() {
    // A repository you only cloned: the files are there, no record exists.
    let fx = fixture();
    for kind in ConfigKind::ALL {
        let error = require_in(&fx.store, &fx.root, kind).unwrap_err().to_string();
        assert!(error.contains("not trusted") && error.contains("never confirmed") && error.contains("yana-rt trust allow"), "{error}");
    }
}

#[test]
fn the_first_confirmation_trusts_exactly_that_kind() {
    let fx = fixture();
    assert!(allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap(), "first time counts as a change");
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_ok());
    assert!(require_in(&fx.store, &fx.root, ConfigKind::McpServers).is_err(), "the other configuration is still unconfirmed");
    assert!(!allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap(), "confirming the same content again changes nothing");
}

#[test]
fn any_change_to_the_content_must_be_confirmed_again() {
    let fx = fixture();
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    for changed in [r#"{"endpoint":"https://evil.example/q"}"#, r#"{"endpoint":"https://s.example/q" }"#, r#"{"endpoint":"https://s.example/q","max_results":3}"#] {
        rewrite(&fx, "web-search.json", changed);
        let error = require_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap_err().to_string();
        assert!(error.contains("changed since it was confirmed"), "{changed}: {error}");
    }
    rewrite(&fx, "web-search.json", SEARCH);
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_ok(), "restoring the confirmed bytes is trusted again");
}

#[test]
fn the_same_content_in_another_repository_is_not_trusted() {
    let fx = fixture();
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    let other = fx._outer.path().join("other-repo");
    std::fs::create_dir_all(other.join(".yana-ai")).unwrap();
    std::fs::write(other.join(".yana-ai/web-search.json"), SEARCH).unwrap();
    assert!(require_in(&fx.store, &other, ConfigKind::WebSearch).is_err(), "trust belongs to one repository, not to a content hash anywhere");
}

#[test]
fn a_deleted_or_damaged_store_means_not_trusted() {
    let fx = fixture();
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    let record = record_path(&fx.store, &fx.root).unwrap();
    std::fs::write(&record, "not json at all").unwrap();
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "damaged");
    std::fs::write(&record, r#"{"repo":"x","entries":{"web-search.json":123}}"#).unwrap();
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "wrong shape");
    std::fs::remove_file(&record).unwrap();
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "record deleted");
    std::fs::remove_dir_all(&fx.store).unwrap();
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "whole store deleted");
}

#[test]
fn a_missing_configuration_is_reported_as_missing_not_as_trusted() {
    let fx = fixture();
    std::fs::remove_file(fx.root.join(".yana-ai/web-search.json")).unwrap();
    let error = require_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap_err();
    assert!(matches!(error, CapabilityError::Unsupported { .. }), "{error:?}");
    assert!(allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "nothing to confirm");
}

#[test]
fn a_trust_store_inside_the_repository_is_refused() {
    let fx = fixture();
    let inside = fx.root.join(".yana-ai").join("trust");
    assert!(allow_in(&inside, &fx.root, ConfigKind::WebSearch).is_err());
    assert!(require_in(&inside, &fx.root, ConfigKind::WebSearch).is_err(), "even to read from");
    assert!(!inside.exists(), "nothing was written there");
    let nested = fx.root.join("docs").join("a").join("b");
    assert!(allow_in(&nested, &fx.root, ConfigKind::WebSearch).is_err(), "or anywhere below the root");
}

#[test]
fn the_trust_hash_is_of_the_exact_bytes() {
    let fx = fixture();
    let a = fingerprint(&fx.root, ConfigKind::WebSearch).unwrap();
    assert_eq!(a.len(), 64);
    rewrite(&fx, "web-search.json", &format!("{SEARCH}\n"));
    assert_ne!(a, fingerprint(&fx.root, ConfigKind::WebSearch).unwrap(), "a trailing newline is a different file");
}

fn lease_root(fx: &Fixture) {
    let marker = fx.root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
}

fn grant(fx: &Fixture, capability: &str) {
    crate::capability::lease::LeaseStore::for_root(&fx.root)
        .grant("agent:t".into(), capability.into(), vec!["gh".into()], vec![], "human".into(), 30, None, None)
        .unwrap();
}

fn active(fx: &Fixture, capability: &str) -> usize {
    crate::capability::lease::LeaseStore::for_root(&fx.root).list().unwrap().iter().filter(|l| !l.revoked && l.capability == capability).count()
}

#[test]
fn confirming_a_changed_configuration_revokes_the_leases_that_depended_on_the_old_one() {
    let fx = fixture();
    lease_root(&fx);
    allow_in(&fx.store, &fx.root, ConfigKind::McpServers).unwrap();
    grant(&fx, "mcp.call");
    grant(&fx, "web.search");
    grant(&fx, "command.execute");
    assert_eq!(active(&fx, "mcp.call"), 1);
    assert!(!allow_in(&fx.store, &fx.root, ConfigKind::McpServers).unwrap(), "same content");
    assert_eq!(active(&fx, "mcp.call"), 1, "an unchanged confirmation leaves leases alone");
    rewrite(&fx, "mcp-servers.json", r#"{"servers":[{"name":"x","command":"y"}]}"#);
    assert!(allow_in(&fx.store, &fx.root, ConfigKind::McpServers).unwrap());
    assert_eq!(active(&fx, "mcp.call"), 0, "the lease was for the old configuration");
    assert_eq!(active(&fx, "web.search"), 1, "another capability's lease is untouched");
    assert_eq!(active(&fx, "command.execute"), 1);
}

#[test]
fn a_first_confirmation_also_revokes_leases_granted_before_any_confirmation() {
    let fx = fixture();
    lease_root(&fx);
    grant(&fx, "web.search");
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    assert_eq!(active(&fx, "web.search"), 0, "a lease granted against an unconfirmed configuration does not carry over");
}

#[test]
fn revoking_trust_forgets_it_and_the_leases() {
    let fx = fixture();
    lease_root(&fx);
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    grant(&fx, "web.search");
    revoke_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err());
    assert_eq!(active(&fx, "web.search"), 0);
}

fn confirm(fx: &Fixture, interactive: bool, typed: &str) -> anyhow::Result<bool> {
    let mut input = std::io::Cursor::new(typed.as_bytes().to_vec());
    let mut shown = Vec::new();
    let result = confirm_and_allow(&fx.store, &fx.root, ConfigKind::WebSearch, interactive, &mut input, &mut shown);
    if let Ok(true) = result {
        let shown = String::from_utf8_lossy(&shown);
        assert!(shown.contains("https://s.example/q") && shown.contains("sha256 "), "the person is shown the content and its hash: {shown}");
    }
    result
}

#[test]
fn only_a_person_at_a_terminal_typing_yes_can_confirm() {
    let fx = fixture();
    assert!(confirm(&fx, false, "yes\n").is_err(), "no terminal (e.g. run through run_command): refused even if 'yes' is supplied");
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err());
    for wrong in ["", "y\n", "YES\n", "no\n", "yes please\n", "\n"] {
        assert!(confirm(&fx, true, wrong).is_err(), "{wrong:?}");
    }
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "nothing was recorded");
    assert!(confirm(&fx, true, "yes\n").unwrap());
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_ok());
}

#[test]
fn what_a_person_is_shown_cannot_rewrite_the_terminal_and_a_huge_file_is_refused() {
    let fx = fixture();
    rewrite(&fx, "web-search.json", "{\"endpoint\":\"https://s.example/q\"}\u{1b}[2J\u{7}");
    let mut shown = Vec::new();
    let mut input = std::io::Cursor::new(b"yes\n".to_vec());
    confirm_and_allow(&fx.store, &fx.root, ConfigKind::WebSearch, true, &mut input, &mut shown).unwrap();
    let shown = String::from_utf8_lossy(&shown);
    assert!(!shown.contains('\u{1b}') && !shown.contains('\u{7}'), "control characters are shown as ?");
    rewrite(&fx, "web-search.json", &" ".repeat(MAX_REVIEW_BYTES + 1));
    let mut input = std::io::Cursor::new(b"yes\n".to_vec());
    assert!(confirm_and_allow(&fx.store, &fx.root, ConfigKind::WebSearch, true, &mut input, &mut Vec::new()).is_err());
}

#[test]
fn kind_names_round_trip() {
    for kind in ConfigKind::ALL {
        assert_eq!(ConfigKind::parse(kind.label()), Some(kind));
    }
    assert_eq!(ConfigKind::parse("leases"), None);
}

#[test]
fn the_default_store_is_under_the_home_directory_and_per_profile() {
    // Only the shape is checked; the real environment is read, nothing is written.
    if let (Some(home), Ok(dir)) = (std::env::var_os("HOME"), super::store_dir()) {
        if std::env::var_os("YANA_TRUST_DIR").is_none() {
            assert!(dir.starts_with(PathBuf::from(home).join(".yana-ai").join("trust")), "{dir:?}");
        }
    }
}

/// Input that rewrites the configuration at the moment the person "types": the
/// time a real person spends reading is exactly when a file can change under them.
struct RewriteWhileReading {
    path: PathBuf,
    typed: std::io::Cursor<Vec<u8>>,
}

impl std::io::Read for RewriteWhileReading {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.typed.read(buf)
    }
}

impl BufRead for RewriteWhileReading {
    fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
        std::fs::write(&self.path, r#"{"endpoint":"https://evil.example/q"}"#).unwrap();
        self.typed.fill_buf()
    }
    fn consume(&mut self, amount: usize) {
        self.typed.consume(amount)
    }
}

#[test]
fn a_file_rewritten_while_the_person_reads_is_not_the_one_that_gets_trusted() {
    let fx = fixture();
    let mut input = RewriteWhileReading { path: fx.root.join(".yana-ai/web-search.json"), typed: std::io::Cursor::new(b"yes\n".to_vec()) };
    let error = confirm_and_allow(&fx.store, &fx.root, ConfigKind::WebSearch, true, &mut input, &mut Vec::new()).unwrap_err().to_string();
    assert!(error.contains("changed after it was shown"), "{error}");
    assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "neither version is trusted");
    assert!(!record_path(&fx.store, &fx.root).unwrap().exists(), "nothing was recorded");
}

#[test]
fn the_hash_a_person_is_shown_is_the_one_that_is_recorded() {
    let fx = fixture();
    let (shown, hash) = cli::review_text(&fx.root, ConfigKind::WebSearch).unwrap();
    assert!(shown.ends_with(&format!("sha256 {hash}")));
    assert!(allow_hash_in(&fx.store, &fx.root, ConfigKind::WebSearch, &hash).unwrap());
    assert_eq!(read_record(&fx.store, &fx.root).entries.get("web-search.json"), Some(&hash));
    assert!(allow_hash_in(&fx.store, &fx.root, ConfigKind::WebSearch, &"0".repeat(64)).is_err(), "a hash the file does not have");
}

#[test]
fn the_bytes_that_are_checked_are_the_bytes_that_are_returned_for_parsing() {
    let fx = fixture();
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    assert_eq!(trusted_bytes_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap(), SEARCH.as_bytes());
    rewrite(&fx, "web-search.json", "{}");
    assert!(trusted_bytes_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "changed bytes are never handed over");
}

#[test]
fn a_huge_file_is_not_read_and_not_trusted() {
    let fx = fixture();
    rewrite(&fx, "web-search.json", &" ".repeat(MAX_CONFIG_BYTES as usize + 1));
    assert!(matches!(fingerprint(&fx.root, ConfigKind::WebSearch), Err(CapabilityError::InvalidInput { .. })));
    assert!(allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err());
    rewrite(&fx, "web-search.json", &" ".repeat(MAX_CONFIG_BYTES as usize));
    assert!(fingerprint(&fx.root, ConfigKind::WebSearch).is_ok(), "exactly the limit is accepted");
}

#[cfg(unix)]
#[test]
fn a_pipe_or_other_non_file_where_the_configuration_should_be_is_refused_without_blocking() {
    let fx = fixture();
    let path = fx.root.join(".yana-ai/web-search.json");
    std::fs::remove_file(&path).unwrap();
    let made = std::process::Command::new("mkfifo").arg(&path).status().map(|s| s.success()).unwrap_or(false);
    if made {
        assert!(matches!(fingerprint(&fx.root, ConfigKind::WebSearch), Err(CapabilityError::Io { .. })), "a FIFO must not block the reader");
    }
    std::fs::remove_file(&path).ok();
    std::fs::create_dir(&path).unwrap();
    assert!(matches!(fingerprint(&fx.root, ConfigKind::WebSearch), Err(CapabilityError::Io { .. })), "a directory");
}

#[test]
fn invisible_and_direction_characters_are_shown_as_question_marks() {
    let shown = cli::printable("a\u{202e}b\u{200b}c\u{2028}d\u{feff}e\u{1b}f\ng");
    assert_eq!(shown, "a?b?c?d?e?f\ng");
}

#[test]
fn a_lease_store_that_cannot_be_updated_stops_the_confirmation() {
    let fx = fixture();
    lease_root(&fx);
    grant(&fx, "web.search");
    std::fs::write(fx.root.join(".yana-ai/leases.json"), "not json").unwrap();
    let result = allow_in(&fx.store, &fx.root, ConfigKind::WebSearch);
    if result.is_err() {
        assert!(require_in(&fx.store, &fx.root, ConfigKind::WebSearch).is_err(), "not trusted while the old leases could not be revoked");
    } else {
        assert_eq!(active(&fx, "web.search"), 0, "or, if the store coped, the lease is gone");
    }
}

#[cfg(unix)]
#[test]
fn the_record_is_private_to_its_owner() {
    use std::os::unix::fs::PermissionsExt;
    let fx = fixture();
    allow_in(&fx.store, &fx.root, ConfigKind::WebSearch).unwrap();
    let mode = std::fs::metadata(record_path(&fx.store, &fx.root).unwrap()).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

#[test]
fn revoking_what_was_never_trusted_is_quiet_and_changes_nothing() {
    let fx = fixture();
    revoke_in(&fx.store, &fx.root, ConfigKind::McpServers).unwrap();
    assert!(!record_path(&fx.store, &fx.root).unwrap().exists());
}

#[test]
fn a_command_the_agent_started_cannot_confirm() {
    assert!(cli::refuse_inside_agent_command(true).is_err());
    assert!(cli::refuse_inside_agent_command(false).is_ok());
}

#[cfg(unix)]
#[test]
fn every_command_the_agent_spawns_carries_the_marker() {
    let dir = tempfile::tempdir().unwrap();
    let output = crate::capability::command::spawn_command(dir.path(), &["/usr/bin/env".to_string()], false).unwrap();
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(text.lines().any(|l| l == "YANA_AGENT_CHILD=1"), "{text}");
}
