//! Regression tests for `check_gitignore`: only real ignore rules count.
//! A commented-out entry, a negation, or a longer name that merely contains
//! the pattern (`.environment`, `.env.local`) must not be reported as coverage.

use super::check_gitignore;
use std::fs;
use tempfile::tempdir;

fn status_of(gitignore: &str) -> (&'static str, String) {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join(".gitignore"), gitignore).unwrap();
    let c = check_gitignore(dir.path().to_str().unwrap());
    (c.status_name(), c.detail)
}

const FULL: &str = ".env\n*.pem\n*.key\ncredentials.json\ntoken.json\n";

#[test]
fn commented_out_entries_do_not_count_as_coverage() {
    let all_commented: String = FULL.lines().map(|l| format!("# {l}\n")).collect();
    let (status, detail) = status_of(&all_commented);
    assert_eq!(status, "WARN");
    for pattern in [".env", "*.pem", "*.key", "credentials.json", "token.json"] {
        assert!(detail.contains(pattern), "{pattern} should be reported missing: {detail}");
    }
}

#[test]
fn a_longer_name_containing_the_pattern_does_not_cover_it() {
    let lookalikes = [
        (".environment", ".env"),
        (".env.local", ".env"),
        ("keystore.keyring", "*.key"),
        ("mycredentials.json.bak", "credentials.json"),
        ("token.json.bak", "token.json"),
    ];
    for (bogus, replaced) in lookalikes {
        let content: String = FULL
            .lines()
            .map(|l| format!("{}\n", if l == replaced { bogus } else { l }))
            .collect();
        let (status, detail) = status_of(&content);
        assert_eq!(status, "WARN", "{bogus} must not cover {replaced}");
        assert!(detail.contains(replaced), "{bogus}: {detail}");
    }
}

#[test]
fn a_negated_entry_does_not_count() {
    let (status, detail) = status_of("!.env\n*.pem\n*.key\ncredentials.json\ntoken.json\n");
    assert_eq!(status, "WARN");
    assert!(detail.contains(".env"));
}

#[test]
fn anchored_recursive_padded_and_crlf_spellings_still_count() {
    for spelling in ["/.env", "**/.env", "  .env  ", ".env\r", "*.env", ".env*"] {
        let (status, detail) = status_of(&format!("{spelling}\n*.pem\n*.key\ncredentials.json\ntoken.json\n"));
        assert_eq!(status, "OK", "{spelling:?}: {detail}");
    }
}

#[test]
fn a_full_real_gitignore_still_passes() {
    assert_eq!(status_of(FULL).0, "OK");
}
