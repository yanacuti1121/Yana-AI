use super::*;
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
