//! Behavior tests for the parts of `filescan check` that need no network:
//! file validation, streaming hashing, the VirusTotal response model and the
//! text shown to the user. The hash-only lookup is the privacy guarantee, so
//! the tests also pin that a rendered result never contains file content.

use super::*;
use std::io::Write;
use tempfile::{tempdir, NamedTempFile};

fn envelope(json: &str) -> VtEnvelope {
    serde_json::from_str(json).unwrap_or_else(|e| panic!("bad fixture: {e}"))
}

const FLAGGED: &str = r#"{"data":{"attributes":{
    "last_analysis_stats":{"malicious":2,"suspicious":1,"undetected":10,"harmless":50,"timeout":1},
    "last_analysis_results":{
        "EngineA":{"category":"malicious","result":"Trojan.Gen"},
        "EngineB":{"category":"suspicious","result":null},
        "EngineC":{"category":"harmless","result":null},
        "EngineD":{"category":"undetected","result":null}},
    "meaningful_name":"setup.exe"}}}"#;

const CLEAN: &str = r#"{"data":{"attributes":{"last_analysis_stats":{"harmless":60,"undetected":12}}}}"#;

// ── validate_file ────────────────────────────────────────────────────────────

#[test]
fn a_missing_path_and_a_directory_are_rejected() {
    let d = tempdir().unwrap();
    assert!(validate_file(&d.path().join("nope")).unwrap_err().to_string().contains("cannot read"));
    assert!(validate_file(d.path()).unwrap_err().to_string().contains("not a regular file"));
}

#[test]
fn an_ordinary_file_passes_and_one_over_the_size_cap_is_refused_before_any_hashing() {
    let f = NamedTempFile::new().unwrap();
    assert!(validate_file(f.path()).is_ok());
    let big = NamedTempFile::new().unwrap();
    big.as_file().set_len(MAX_FILE_SIZE_BYTES + 1).unwrap(); // sparse: no real disk use
    let msg = validate_file(big.path()).unwrap_err().to_string();
    assert!(msg.contains("too large") && msg.contains("shasum"), "{msg}");
    let exactly = NamedTempFile::new().unwrap();
    exactly.as_file().set_len(MAX_FILE_SIZE_BYTES).unwrap();
    assert!(validate_file(exactly.path()).is_ok(), "the cap itself is allowed");
}

// ── hashing ──────────────────────────────────────────────────────────────────

#[test]
fn hashing_streams_a_large_file_to_the_published_vector() {
    // SHA-256 of one million 'a' (FIPS 180-2 Appendix B.3).
    let mut f = NamedTempFile::new().unwrap();
    let chunk = [b'a'; 10_000];
    for _ in 0..100 {
        f.write_all(&chunk).unwrap();
    }
    assert_eq!(sha256_file(f.path()).unwrap(), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
}

#[test]
fn the_hash_is_lowercase_hex_of_a_fixed_length() {
    let mut f = NamedTempFile::new().unwrap();
    f.write_all(b"any content").unwrap();
    let h = sha256_file(f.path()).unwrap();
    assert_eq!(h.len(), 64);
    assert!(h.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)));
}

// ── response model ───────────────────────────────────────────────────────────

#[test]
fn a_minimal_response_uses_defaults_for_missing_fields() {
    let v = envelope(CLEAN);
    assert_eq!((v.data.attributes.last_analysis_stats.malicious, v.data.attributes.last_analysis_stats.timeout), (0, 0));
    assert!(v.data.attributes.last_analysis_results.is_empty() && v.data.attributes.meaningful_name.is_none());
}

#[test]
fn a_response_without_analysis_stats_is_a_parse_error() {
    assert!(serde_json::from_str::<VtEnvelope>(r#"{"data":{"attributes":{}}}"#).is_err());
    assert!(serde_json::from_str::<VtEnvelope>("not json").is_err());
}

// ── rendered text ────────────────────────────────────────────────────────────

#[test]
fn a_flagged_file_lists_only_the_engines_that_flagged_it() {
    let out = render_result(Path::new("dl/setup.exe"), "abc123", &envelope(FLAGGED));
    assert!(out.contains("FLAGGED — do not open: dl/setup.exe"));
    assert!(out.contains("3/64 engines"), "flagged/total counts every stat bucket: {out}");
    assert!(out.contains("EngineA: malicious (Trojan.Gen)"));
    assert!(out.contains("EngineB: suspicious (?)"), "a missing verdict shows as ?");
    assert!(!out.contains("EngineC") && !out.contains("EngineD"));
    assert!(out.contains("Hash: abc123") && out.contains("Known filename on VirusTotal: setup.exe"));
}

#[test]
fn a_clean_file_reports_checked_engines_and_no_engine_list() {
    let out = render_result(Path::new("ok.bin"), "def456", &envelope(CLEAN));
    assert!(out.contains("CLEAN — 72/72 engines checked"), "{out}");
    assert!(!out.contains("FLAGGED") && !out.contains("Known filename"));
    assert!(out.contains("Hash: def456"));
}

#[test]
fn a_single_suspicious_verdict_is_enough_to_flag() {
    let one = envelope(r#"{"data":{"attributes":{"last_analysis_stats":{"suspicious":1,"harmless":9}}}}"#);
    assert!(render_result(Path::new("x"), "h", &one).contains("FLAGGED"));
}

#[test]
fn an_unknown_hash_says_unknown_and_not_safe() {
    let out = render_unknown(Path::new("mystery.dmg"));
    assert!(out.contains("UNKNOWN") && out.contains("does NOT mean it's safe"));
    assert!(out.contains("mystery.dmg") && out.contains("virustotal.com"));
    assert!(!out.contains("CLEAN"));
}

#[test]
fn a_rendered_result_never_contains_file_content() {
    let mut f = NamedTempFile::new().unwrap();
    f.write_all(b"TOP-SECRET-PAYLOAD").unwrap();
    let hash = sha256_file(f.path()).unwrap();
    for out in [render_result(f.path(), &hash, &envelope(FLAGGED)), render_result(f.path(), &hash, &envelope(CLEAN)), render_unknown(f.path())] {
        assert!(!out.contains("TOP-SECRET-PAYLOAD"));
    }
}
