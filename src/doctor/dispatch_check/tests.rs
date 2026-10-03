//! Behavior tests for the `doctor dispatch` text parsers and drift check.
//! Inputs are small inline snippets in the same one-variant-per-line style the
//! real src/main.rs and bin/yana use.

use super::*;
use tempfile::tempdir;

fn names(v: Vec<(String, Option<String>)>) -> Vec<String> {
    v.into_iter().map(|(n, _)| n).collect()
}

// ── pascal_to_kebab ──────────────────────────────────────────────────────────

#[test]
fn kebab_case_matches_clap_derive_for_common_shapes() {
    let cases = [
        ("Task", "task"),
        ("SkillQuality", "skill-quality"),
        ("Observability", "observability"),
        ("YanaAI", "yana-ai"),
        ("Version2Check", "version2-check"),
        ("ABC", "abc"),
        ("", ""),
    ];
    for (pascal, kebab) in cases {
        assert_eq!(pascal_to_kebab(pascal), kebab, "{pascal:?}");
    }
}

// ── extract_rust_commands ────────────────────────────────────────────────────

const MAIN_RS: &str = "\
use clap::Parser;
struct Other { Field: u8 }
enum Commands {
    /// Scan things
    Scan {
        target: String,
        Nested: u8,
    },
    Doctor,
    SkillQuality { x: u8 },
}
enum Later { NotACommand, }
";

#[test]
fn rust_commands_are_the_top_level_variants_only() {
    assert_eq!(names(extract_rust_commands(MAIN_RS)), vec!["Scan", "Doctor", "SkillQuality"]);
}

#[test]
fn rust_commands_of_a_file_without_the_enum_are_empty() {
    assert!(extract_rust_commands("fn main() {}\nenum Other { A, }\n").is_empty());
    assert!(extract_rust_commands("").is_empty());
}

#[test]
fn exempt_marker_attaches_to_the_next_variant_and_joins_wrapped_lines() {
    let src = "\
enum Commands {
    /// DOCTOR_DISPATCH_EXEMPT: python is canonical
    /// and stays that way
    Config { x: u8 },
    // DOCTOR_DISPATCH_EXEMPT: plain comment marker
    Watch,
    Plain,
}
";
    let found = extract_rust_commands(src);
    assert_eq!(found[0], ("Config".into(), Some("python is canonical and stays that way".into())));
    assert_eq!(found[1], ("Watch".into(), Some("plain comment marker".into())));
    assert_eq!(found[2], ("Plain".into(), None));
}

#[test]
fn exempt_marker_does_not_leak_past_an_intervening_line() {
    let src = "\
enum Commands {
    /// DOCTOR_DISPATCH_EXEMPT: only for the next one
    #[command(hide = true)]
    Hidden,
    Visible,
}
";
    let found = extract_rust_commands(src);
    assert_eq!(found[0].1, None);
    assert_eq!(found[1].1, None);
}

#[test]
fn a_brace_inside_a_doc_comment_does_not_desync_the_depth_counter() {
    let src = "\
enum Commands {
    /// takes a { target } argument {
    Scan { target: String },
    Doctor,
}
";
    assert_eq!(names(extract_rust_commands(src)), vec!["Scan", "Doctor"]);
}

// ── literal_rt_word ──────────────────────────────────────────────────────────

#[test]
fn literal_rt_word_finds_bare_invocations_in_the_usual_positions() {
    assert_eq!(literal_rt_word("rt scan \"$@\""), Some("scan".into()));
    assert_eq!(literal_rt_word("cmd_audit() { rt scan \"$@\"; }"), Some("scan".into()));
    assert_eq!(literal_rt_word("foo; rt task list"), Some("task".into()));
    assert_eq!(literal_rt_word("scan) rt scan \"$@\" ;;"), Some("scan".into()));
}

#[test]
fn literal_rt_word_ignores_passthrough_variable_and_lookalike_calls() {
    assert_eq!(literal_rt_word("rt \"$COMMAND\" \"$@\""), None);
    assert_eq!(literal_rt_word("rt $CMD arg"), None);
    assert_eq!(literal_rt_word("start scan"), None);
    assert_eq!(literal_rt_word("echo rt scan"), None);
    assert_eq!(literal_rt_word("no invocation here"), None);
}

// ── find_passthrough_labels / extract_bin_yana_routes ───────────────────────

const BIN_YANA: &str = "\
#!/usr/bin/env bash
rt list-before-case
case \"$COMMAND\" in
  scan) rt scan \"$@\" ;;
  task|eval|bus)
    rt \"$COMMAND\" \"$@\" ;;
  # commented|out)
  policy)
    case \"$SUB\" in
      check)
        rt \"$COMMAND\" \"$@\" ;;
    esac
    ;;
  *)
    rt \"$COMMAND\" \"$@\" ;;
esac
rt after-esac
";

#[test]
fn passthrough_labels_are_the_outer_case_arms_that_forward_the_command() {
    assert_eq!(find_passthrough_labels(BIN_YANA), vec!["task", "eval", "bus"]);
}

#[test]
fn nested_case_labels_and_the_wildcard_are_not_treated_as_routes() {
    let labels = find_passthrough_labels(BIN_YANA);
    for not_a_route in ["check", "*", "policy"] {
        assert!(!labels.iter().any(|l| l == not_a_route), "{not_a_route}");
    }
}

#[test]
fn text_before_the_outer_case_and_after_its_esac_is_ignored_for_passthrough() {
    assert!(find_passthrough_labels("rt \"$COMMAND\" x\n").is_empty());
    let after = "case \"$COMMAND\" in\n  a) rt a ;;\nesac\n  b|c)\n    rt \"$COMMAND\" ;;\n";
    assert!(find_passthrough_labels(after).is_empty());
}

#[test]
fn routes_combine_literal_and_passthrough_and_skip_comments() {
    let routes = extract_bin_yana_routes(BIN_YANA);
    for expected in ["scan", "task", "eval", "bus", "list-before-case", "after-esac"] {
        assert!(routes.iter().any(|r| r == expected), "missing {expected}: {routes:?}");
    }
    let commented = extract_bin_yana_routes("# rt legacy\nrt live\n");
    assert_eq!(commented, vec!["live"]);
}

// ── check(): the drift report ────────────────────────────────────────────────

fn repo(main_rs: &str, bin_yana: &str) -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("src")).unwrap();
    fs::create_dir_all(dir.path().join("bin")).unwrap();
    fs::write(dir.path().join("src/main.rs"), main_rs).unwrap();
    fs::write(dir.path().join("bin/yana"), bin_yana).unwrap();
    dir
}

const MAIN_TWO: &str = "enum Commands {\n    Scan,\n    SkillQuality,\n}\n";

#[test]
fn matching_tables_report_no_findings_and_kebab_names() {
    let d = repo(MAIN_TWO, "rt scan\nrt skill-quality\n");
    let r = check(d.path());
    assert!(r.findings.is_empty() && r.exempt.is_empty());
    assert_eq!(r.rust_subcommands, vec!["scan", "skill-quality"]);
}

#[test]
fn a_rust_command_with_no_route_is_reported_unreachable() {
    let d = repo(MAIN_TWO, "rt scan\n");
    let r = check(d.path());
    assert_eq!(r.findings.len(), 1);
    assert!(r.findings[0].rust_unreachable);
    assert_eq!(r.findings[0].name, "skill-quality");
    assert!(r.findings[0].detail.contains("unreachable"));
}

#[test]
fn a_route_to_a_missing_rust_command_is_reported() {
    let d = repo(MAIN_TWO, "rt scan\nrt skill-quality\nrt ghost\n");
    let r = check(d.path());
    assert_eq!(r.findings.len(), 1);
    assert!(!r.findings[0].rust_unreachable);
    assert_eq!(r.findings[0].name, "ghost");
}

#[test]
fn an_exempt_unrouted_command_is_listed_separately_not_as_a_finding() {
    let main = "enum Commands {\n    Scan,\n    /// DOCTOR_DISPATCH_EXEMPT: python is canonical\n    Watch,\n}\n";
    let r = check(repo(main, "rt scan\n").path());
    assert!(r.findings.is_empty());
    assert_eq!(r.exempt, vec![("watch".to_string(), "python is canonical".to_string())]);
}

#[test]
fn an_exempt_command_that_is_routed_is_neither_a_finding_nor_listed_as_exempt() {
    let main = "enum Commands {\n    /// DOCTOR_DISPATCH_EXEMPT: x\n    Watch,\n}\n";
    let r = check(repo(main, "rt watch\n").path());
    assert!(r.findings.is_empty() && r.exempt.is_empty());
}

#[test]
fn missing_files_yield_an_empty_report_instead_of_an_error() {
    let dir = tempdir().unwrap();
    let r = check(dir.path());
    assert!(r.rust_subcommands.is_empty() && r.findings.is_empty() && r.exempt.is_empty());
}
