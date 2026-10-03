//! Behavior tests for the knowledge-graph readers: the summary, search, the
//! onboarding guide and the change-impact report. Output is checked through
//! the render functions; `graph diff` runs against real temp git repositories.

use super::*;
use std::fs;
use std::process::Command;
use tempfile::tempdir;

const STAMP: &str = "2026-09-30T12:34:56Z";
/// Search result summaries and the console tour are cut at these lengths.
const SUMMARY_CAP: usize = 80;
const TOUR_PREVIEW: usize = 5;
const MOST_CONNECTED: usize = 10;

fn node(id: &str, kind: &str, name: &str, path: &str) -> Node {
    Node {
        id: id.into(), node_type: kind.into(), name: name.into(), file_path: path.into(),
        language: "Rust".into(), summary: String::new(), complexity: String::new(),
        tags: vec![], line_range: None, category: String::new(),
    }
}

fn file(path: &str) -> Node {
    node(&format!("file:{path}"), "file", path.rsplit('/').next().unwrap(), path)
}

fn edge(src: &str, dst: &str) -> Edge {
    Edge { source: src.into(), target: dst.into(), edge_type: "imports".into(), weight: 1.0 }
}

fn graph(nodes: Vec<Node>, edges: Vec<Edge>) -> GraphData {
    GraphData {
        meta: GraphMeta {
            project: "demo".into(), root: ".".into(), languages: vec!["Rust".into(), "Python".into()],
            frameworks: vec![], total_files: nodes.len(), analysed_at: STAMP.into(), schema_version: "1.0".into(),
        },
        nodes, edges, tour: vec![],
    }
}

fn step(order: usize, name: &str) -> TourStep {
    TourStep { order, node_id: format!("file:{name}"), name: name.into(), file_path: format!("src/{name}"), language: "Rust".into(), reason: "entry point".into(), layer: "Service Layer".into() }
}

// ── render_show ──────────────────────────────────────────────────────────────

#[test]
fn show_reports_counts_and_hides_empty_sections() {
    let mut d = graph(vec![file("src/a.rs"), file("src/b.rs"), node("fn:x", "function", "x", "src/a.rs")], vec![edge("file:src/a.rs", "file:src/b.rs")]);
    let out = render_show(&d);
    assert!(out.contains("  demo") && out.contains("Languages   Rust, Python"));
    assert!(out.contains("Files       2") && out.contains("Functions   1") && out.contains("Edges       1"));
    assert!(!out.contains("Frameworks") && !out.contains("Classes"));
    assert!(out.contains("Analysed    2026-09-30T12:34:56") && !out.contains("Z\n"));
    d.meta.frameworks = vec!["Axum".into()];
    assert!(render_show(&d).contains("Frameworks  Axum"));
}

#[test]
fn show_lists_layers_by_size_and_previews_the_tour() {
    let mut d = graph(vec![file("src/a.rs"), file("src/b.rs"), file("docs/x.md")], vec![]);
    d.tour = (1..=TOUR_PREVIEW + 3).map(|i| step(i, &format!("f{i}.rs"))).collect();
    let out = render_show(&d);
    assert!(out.find("Service Layer").unwrap() < out.find("Documentation").unwrap(), "bigger layer first");
    assert!(out.contains("Tour (8 steps)") && out.contains("f5.rs") && !out.contains("f6.rs"));
    assert!(out.contains("… and 3 more"));
}

#[test]
fn a_short_or_empty_analysed_at_does_not_crash_show_or_onboard() {
    for stamp in ["", "2026", "2026-09-30"] {
        let mut d = graph(vec![file("src/a.rs")], vec![]);
        d.meta.analysed_at = stamp.into();
        assert!(render_show(&d).contains("Analysed"), "{stamp:?}");
        assert!(render_onboard(&d).contains("Analysed"), "{stamp:?}");
    }
}

// ── render_search ────────────────────────────────────────────────────────────

fn searchable() -> GraphData {
    let mut auth = node("n1", "function", "authenticate", "src/auth.rs");
    auth.tags = vec!["Security".into()];
    auth.summary = "x".repeat(SUMMARY_CAP + 30);
    let mut exact = node("n2", "function", "auth", "src/misc.rs");
    exact.language = "Go".into();
    let contains = node("n3", "class", "OAuthClient", "src/net.rs");
    let unrelated = node("n4", "file", "readme", "docs/readme.md");
    // the substring match comes first in the node list so ranking, not insertion order, puts it last
    graph(vec![contains, auth, exact, unrelated], vec![edge("n2", "n1"), edge("n3", "n2")])
}

#[test]
fn search_matches_name_path_tag_and_language_ignoring_case_of_the_query() {
    let d = searchable();
    assert!(render_search(&d, "AUTH", false, 10).contains("authenticate"));
    assert!(render_search(&d, "docs/", false, 10).contains("readme"));
    assert!(render_search(&d, "go", false, 10).contains("[function      ] auth"));
    assert!(render_search(&d, "zzz", false, 10).starts_with("(no results for 'zzz')"));
}

#[test]
fn search_tags_match_regardless_of_their_own_case() {
    assert!(render_search(&searchable(), "security", false, 10).contains("authenticate"));
}

#[test]
fn search_ranks_exact_then_prefix_then_substring_and_honours_the_limit() {
    let d = searchable();
    let out = render_search(&d, "auth", false, 10);
    let pos = |name: &str| out.find(&format!("] {name}\n")).unwrap_or_else(|| panic!("{name} missing:\n{out}"));
    assert!(pos("auth") < pos("authenticate") && pos("authenticate") < pos("OAuthClient"));
    let limited = render_search(&d, "auth", false, 1);
    assert!(limited.contains("1 result(s)") && !limited.contains("OAuthClient"));
}

#[test]
fn search_cuts_long_summaries() {
    let out = render_search(&searchable(), "authenticate", false, 1);
    assert!(out.contains(&"x".repeat(SUMMARY_CAP)) && !out.contains(&"x".repeat(SUMMARY_CAP + 1)));
}

#[test]
fn search_expand_lists_neighbours_in_both_directions_only_when_asked() {
    let d = searchable();
    let plain = render_search(&d, "auth", false, 10);
    assert!(!plain.contains("Connected to"));
    let expanded = render_search(&d, "auth", true, 10);
    assert!(expanded.contains("Connected to 'auth':"));
    assert!(expanded.contains("→ authenticate (src/auth.rs)") && expanded.contains("→ OAuthClient (src/net.rs)"));
}

// ── render_onboard ───────────────────────────────────────────────────────────

#[test]
fn onboard_has_the_overview_layers_tour_and_dash_for_no_frameworks() {
    let mut d = graph(vec![file("src/a.rs"), file("docs/x.md")], vec![]);
    d.tour = vec![step(1, "a.rs")];
    let md = render_onboard(&d);
    assert!(md.starts_with("# demo — Onboarding Guide"));
    assert!(md.contains("**Frameworks:** -") && md.contains("**Analysed:** 2026-09-30\n"));
    assert!(md.contains("- **Service Layer**: 1 nodes") && md.contains("### 1. `a.rs` (Rust)"));
    assert!(md.contains("- Reason: entry point"));
}

#[test]
fn onboard_ranks_files_by_connections_and_keeps_only_the_top_ten() {
    let mut nodes = vec![file("src/hub.rs")];
    let mut edges = vec![];
    for i in 0..MOST_CONNECTED + 2 {
        nodes.push(file(&format!("src/leaf{i:02}.rs")));
        edges.push(edge(&format!("file:src/leaf{i:02}.rs"), "file:src/hub.rs"));
    }
    let md = render_onboard(&graph(nodes, edges));
    let listed = md.lines().filter(|l| l.contains(" connections")).count();
    assert_eq!(listed, MOST_CONNECTED);
    assert!(md.contains("- `src/hub.rs` — 12 connections"));
    assert!(md.find("hub.rs").unwrap() < md.find("leaf00.rs").unwrap());
}

#[test]
fn onboard_output_is_the_same_every_time_even_with_tied_connection_counts() {
    let nodes: Vec<Node> = (0..8).map(|i| file(&format!("src/f{i}.rs"))).collect();
    let edges: Vec<Edge> = (0..8).map(|i| edge(&format!("file:src/f{i}.rs"), &format!("file:src/f{}.rs", (i + 1) % 8))).collect();
    let d = graph(nodes, edges);
    let first = render_onboard(&d);
    for _ in 0..20 {
        assert_eq!(render_onboard(&d), first, "a documentation file must be reproducible");
    }
}

#[test]
fn cmd_onboard_writes_the_same_text_to_a_file() {
    let dir = tempdir().unwrap();
    let out = dir.path().join("guide.md");
    let d = graph(vec![file("src/a.rs")], vec![]);
    cmd_onboard(&d, Some(out.to_str().unwrap())).unwrap();
    assert_eq!(fs::read_to_string(out).unwrap(), render_onboard(&d));
}

// ── impacted_files / cmd_diff ────────────────────────────────────────────────

#[test]
fn impact_lists_each_importing_file_once_in_first_seen_order() {
    let d = graph(
        vec![file("src/core.rs"), file("src/util.rs"), file("src/a.rs"), file("src/b.rs")],
        vec![
            edge("file:src/a.rs", "file:src/core.rs"),
            edge("file:src/b.rs", "file:src/core.rs"),
            edge("file:src/a.rs", "file:src/util.rs"),
            edge("file:src/ghost.rs", "file:src/core.rs"),
        ],
    );
    assert_eq!(impacted_files(&d, &["src/core.rs", "src/util.rs"]), vec!["src/a.rs", "src/b.rs"]);
    assert!(impacted_files(&d, &["src/a.rs"]).is_empty());
}

fn git(dir: &std::path::Path, args: &[&str]) {
    let out = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

fn repo_with_change() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "-q", "-b", "main"]);
    fs::write(dir.path().join("a.txt"), "one").unwrap();
    git(dir.path(), &["add", "."]);
    git(dir.path(), &["commit", "-q", "-m", "init"]);
    fs::write(dir.path().join("a.txt"), "two").unwrap();
    dir
}

#[test]
fn diff_succeeds_in_a_repository_with_and_without_changes() {
    let dir = repo_with_change();
    let d = graph(vec![], vec![]);
    assert!(cmd_diff(&d, "HEAD", dir.path().to_str().unwrap()).is_ok());
    git(dir.path(), &["checkout", "-q", "--", "a.txt"]);
    assert!(cmd_diff(&d, "HEAD", dir.path().to_str().unwrap()).is_ok());
}

#[test]
fn diff_outside_a_repository_or_with_a_bad_revision_is_an_error() {
    let d = graph(vec![], vec![]);
    let plain = tempdir().unwrap();
    assert!(cmd_diff(&d, "HEAD", plain.path().to_str().unwrap()).unwrap_err().to_string().contains("git diff failed"));
    let repo = repo_with_change();
    assert!(cmd_diff(&d, "no-such-rev", repo.path().to_str().unwrap()).is_err());
}

#[test]
fn a_base_that_looks_like_an_option_is_refused_and_writes_nothing() {
    let repo = repo_with_change();
    let victim = repo.path().join("victim.txt");
    fs::write(&victim, "PRECIOUS").unwrap();
    for base in [format!("--output={}", victim.display()), "-p".to_string(), "--".to_string()] {
        let result = cmd_diff(&graph(vec![], vec![]), &base, repo.path().to_str().unwrap());
        assert!(result.is_err(), "{base}");
    }
    assert_eq!(fs::read_to_string(&victim).unwrap(), "PRECIOUS", "git must never be handed an option as the base");
}

// ── path classification helpers (types.rs) ───────────────────────────────────

#[test]
fn languages_layers_and_categories_follow_the_path() {
    for (ext, lang) in [("py", "Python"), ("tsx", "TypeScript"), ("mjs", "JavaScript"), ("rs", "Rust"), ("sh", "Shell"), ("yml", "YAML"), ("md", "Markdown"), ("xyz", "Other")] {
        assert_eq!(lang_from_ext(ext), lang, "{ext}");
    }
    for (path, layer) in [
        ("src/tests/a.rs", "Test Layer"), ("src/a_test.rs", "Test Layer"), ("docs/guide.md", "Documentation"), ("README.md", "Documentation"),
        ("src/utils/x.rs", "Utilities"), ("src/main.rs", "Service Layer"), ("Makefile", "Uncategorized"),
    ] {
        assert_eq!(layer_from_path(path), layer, "{path}");
    }
    for (path, lang, cat) in [("a/test_x.py", "Python", "test"), ("README.md", "Markdown", "docs"), ("c.toml", "TOML", "config"), ("run.sh", "Shell", "scripts"), ("src/a.rs", "Rust", "source")] {
        assert_eq!(category_from_path(path, lang), cat, "{path}");
    }
}
