use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

// ── Public CLI surface ────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum RouteAction {
    /// Classify a task and return routing decision (JSON)
    Classify {
        /// Task description (omit to read from stdin)
        task: Option<String>,
        /// Output plain text instead of JSON
        #[arg(long)]
        plain: bool,
    },
    /// Show pattern tables used for classification
    Patterns,
}

pub fn dispatch(action: RouteAction) {
    match action {
        RouteAction::Classify { task, plain } => cmd_classify(task, plain),
        RouteAction::Patterns                 => cmd_patterns(),
    }
}

// ── Output types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Route {
    Simple,
    Complex,
    External,
}

/// Rule 68 — principal-confidentiality tier. The tier decides whether the
/// text may be persisted and which model class may see it at all.
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Sensitivity {
    Public,
    Internal,
    Confidential,
    Sovereign,
}

#[derive(Serialize)]
pub struct RouteDecision {
    pub route:               Route,
    pub gate:                &'static str,
    pub confidence:          f32,
    pub reason:              String,
    pub matched_signals:     Vec<String>,
    pub suggested_agents:    &'static [&'static str],
    pub sensitivity:         Sensitivity,
    /// false for CONFIDENTIAL+ — caller must not write to memory/git/logs
    pub allow_persist:       bool,
    /// "any" | "cloud-redacted" | "local-only"
    pub model_scope:         &'static str,
    pub sensitivity_signals: Vec<String>,
}

// ── Classifier ────────────────────────────────────────────────────────────────

/// Pattern entry: keyword (lowercase), weight, explanation
struct Pattern {
    keyword: &'static str,
    weight:  f32,
    label:   &'static str,
}

// External — irreversible / crosses system boundary
const EXTERNAL: &[Pattern] = &[
    Pattern { keyword: "git push",       weight: 1.0, label: "remote publish" },
    Pattern { keyword: "push origin",    weight: 1.0, label: "remote publish" },
    Pattern { keyword: "npm publish",    weight: 1.0, label: "registry publish" },
    Pattern { keyword: "pip publish",    weight: 1.0, label: "registry publish" },
    Pattern { keyword: "cargo publish",  weight: 1.0, label: "registry publish" },
    Pattern { keyword: "deploy",         weight: 0.9, label: "deployment" },
    Pattern { keyword: "release",        weight: 0.8, label: "release" },
    Pattern { keyword: "kubectl apply",  weight: 1.0, label: "k8s apply" },
    Pattern { keyword: "terraform apply",weight: 1.0, label: "infra apply" },
    Pattern { keyword: "terraform destroy",weight:1.0,label: "infra destroy" },
    Pattern { keyword: "docker push",    weight: 1.0, label: "registry push" },
    Pattern { keyword: "send email",     weight: 0.9, label: "external message" },
    Pattern { keyword: "send message",   weight: 0.8, label: "external message" },
    Pattern { keyword: "webhook",        weight: 0.8, label: "external call" },
    Pattern { keyword: "stripe",         weight: 0.9, label: "payment api" },
    Pattern { keyword: "payment",        weight: 0.8, label: "payment" },
    Pattern { keyword: "curl ",          weight: 0.7, label: "http call" },
    Pattern { keyword: "http request",   weight: 0.7, label: "http call" },
    Pattern { keyword: "api call",       weight: 0.7, label: "external api" },
    Pattern { keyword: "rm -rf",         weight: 1.0, label: "destructive delete" },
    Pattern { keyword: "drop table",     weight: 1.0, label: "db drop" },
    Pattern { keyword: "drop database",  weight: 1.0, label: "db drop" },
    Pattern { keyword: "database migration", weight: 0.7, label: "db migration" },
];

// Complex — writes / multi-file / needs agents
const COMPLEX: &[Pattern] = &[
    Pattern { keyword: "implement",      weight: 0.9, label: "implementation" },
    Pattern { keyword: "build",          weight: 0.7, label: "build task" },
    Pattern { keyword: "create",         weight: 0.6, label: "create" },
    Pattern { keyword: "write",          weight: 0.6, label: "write" },
    Pattern { keyword: "add feature",    weight: 0.9, label: "feature" },
    Pattern { keyword: "add ",           weight: 0.4, label: "add" },
    Pattern { keyword: "fix",            weight: 0.7, label: "bug fix" },
    Pattern { keyword: "refactor",       weight: 0.9, label: "refactor" },
    Pattern { keyword: "update",         weight: 0.5, label: "update" },
    Pattern { keyword: "modify",         weight: 0.6, label: "modify" },
    Pattern { keyword: "migrate",        weight: 0.8, label: "migration" },
    Pattern { keyword: "upgrade",        weight: 0.7, label: "upgrade" },
    Pattern { keyword: "optimize",       weight: 0.8, label: "optimization" },
    Pattern { keyword: "debug",          weight: 0.8, label: "debug" },
    Pattern { keyword: "test",           weight: 0.6, label: "test" },
    Pattern { keyword: "review",         weight: 0.6, label: "review" },
    Pattern { keyword: "audit",          weight: 0.7, label: "audit" },
    Pattern { keyword: "architect",      weight: 0.8, label: "architecture" },
    Pattern { keyword: "design",         weight: 0.6, label: "design" },
    Pattern { keyword: "set up",         weight: 0.6, label: "setup" },
    Pattern { keyword: "setup",          weight: 0.6, label: "setup" },
    Pattern { keyword: "integrate",      weight: 0.8, label: "integration" },
    Pattern { keyword: "rename",         weight: 0.6, label: "rename" },
    Pattern { keyword: "delete",         weight: 0.6, label: "delete" },
    Pattern { keyword: "remove",         weight: 0.5, label: "remove" },
    Pattern { keyword: "skill",          weight: 0.5, label: "skill work" },
    Pattern { keyword: "nâng cấp",        weight: 0.8, label: "upgrade (vi)" },
    Pattern { keyword: "viết",            weight: 0.7, label: "write (vi)" },
    Pattern { keyword: "tạo",             weight: 0.6, label: "create (vi)" },
    Pattern { keyword: "sửa",             weight: 0.7, label: "fix (vi)" },
    Pattern { keyword: "thêm",            weight: 0.5, label: "add (vi)" },
    Pattern { keyword: "xây",             weight: 0.7, label: "build (vi)" },
    Pattern { keyword: "phát triển",      weight: 0.8, label: "develop (vi)" },
    Pattern { keyword: "triển khai",      weight: 0.8, label: "deploy/implement (vi)" },
    Pattern { keyword: "xây dựng",        weight: 0.8, label: "build (vi)" },
    Pattern { keyword: "cải thiện",       weight: 0.7, label: "improve (vi)" },
    Pattern { keyword: "tái cấu trúc",    weight: 0.9, label: "refactor (vi)" },
    Pattern { keyword: "tối ưu",          weight: 0.8, label: "optimize (vi)" },
    Pattern { keyword: "tích hợp",        weight: 0.8, label: "integrate (vi)" },
    Pattern { keyword: "migrate",         weight: 0.8, label: "migrate (vi)" },
];

// Simple — read-only / explain / search
const SIMPLE: &[Pattern] = &[
    Pattern { keyword: "explain",        weight: 0.9, label: "explain" },
    Pattern { keyword: "what is",        weight: 0.8, label: "question" },
    Pattern { keyword: "how does",       weight: 0.8, label: "question" },
    Pattern { keyword: "show me",        weight: 0.6, label: "show" },
    Pattern { keyword: "list",           weight: 0.7, label: "list" },
    Pattern { keyword: "read",           weight: 0.6, label: "read" },
    Pattern { keyword: "view",           weight: 0.6, label: "view" },
    Pattern { keyword: "check",          weight: 0.5, label: "check" },
    Pattern { keyword: "search",         weight: 0.7, label: "search" },
    Pattern { keyword: "find",           weight: 0.6, label: "find" },
    Pattern { keyword: "grep",           weight: 0.8, label: "grep" },
    Pattern { keyword: "count",          weight: 0.6, label: "count" },
    Pattern { keyword: "diff",           weight: 0.7, label: "diff" },
    Pattern { keyword: " log ",           weight: 0.6, label: "log" },
    Pattern { keyword: "summarize",      weight: 0.8, label: "summarize" },
    Pattern { keyword: "describe",       weight: 0.7, label: "describe" },
    Pattern { keyword: "status",         weight: 0.6, label: "status" },
    Pattern { keyword: "show",           weight: 0.5, label: "show" },
    Pattern { keyword: "display",        weight: 0.6, label: "display" },
    Pattern { keyword: "tell me",        weight: 0.7, label: "question" },
    Pattern { keyword: "what are",       weight: 0.7, label: "question" },
    Pattern { keyword: "where is",       weight: 0.7, label: "question" },
    Pattern { keyword: "why does",       weight: 0.7, label: "question" },
    Pattern { keyword: "xem",            weight: 0.7, label: "view (vi)" },
    Pattern { keyword: "giải thích",     weight: 0.8, label: "explain (vi)" },
    Pattern { keyword: "tìm",            weight: 0.6, label: "find (vi)" },
    Pattern { keyword: "kiểm tra",       weight: 0.5, label: "check (vi)" },
    Pattern { keyword: "cho tôi xem",    weight: 0.7, label: "show (vi)" },
];

// ── Rule 68 — sensitivity markers ─────────────────────────────────────────────
// Sovereign: never typed into any cloud AI — local model only
const SOVEREIGN_MARKERS: &[&str] = &[
    "chỉ mình anh biết",
    "chỉ anh biết",
    "chỉ riêng anh",
    "không ai được biết",
    "sovereign only",
    "for my eyes only",
    "local model only",
    "chỉ model local",
    "#sovereign",
];

// Confidential: explicit no-persist / secrecy markers from the principal
const CONFIDENTIAL_MARKERS: &[&str] = &[
    "bí mật",
    "tuyệt mật",
    "confidential",
    "đừng ghi lại",
    "đừng lưu",
    "không lưu lại",
    "không ghi lại",
    "không được lưu",
    "giữ kín",
    "off the record",
    "do not log",
    "don't log",
    "do not save",
    "don't save",
    "do not persist",
    "#mật",
    "#confidential",
    "#private",
];

// Context smells — money, deals, health, legal, unannounced plans.
// Rule 68 default-deny: when context makes sensitivity obvious, treat as
// CONFIDENTIAL even without an explicit marker.
const CONFIDENTIAL_SMELLS: &[&str] = &[
    "mua công ty",
    "bán công ty",
    "thương vụ",
    "sáp nhập",
    "đàm phán",
    "acquisition",
    "merger",
    "negotiation position",
    "lương của",
    "salary of",
    "chẩn đoán",
    "diagnosis",
    "bệnh án",
    "health record",
    "kiện tụng",
    "lawsuit",
    "chưa công bố",
    "chưa công khai",
    "unannounced",
];

/// Classify rule-68 sensitivity. Marker > smell > explicit-public > internal.
pub fn classify_sensitivity(text: &str) -> (Sensitivity, Vec<String>) {
    let lower = text.to_lowercase();
    let hits = |set: &[&str]| -> Vec<String> {
        set.iter().filter(|m| lower.contains(*m)).map(|m| m.to_string()).collect()
    };

    let sov = hits(SOVEREIGN_MARKERS);
    if !sov.is_empty() {
        return (Sensitivity::Sovereign, sov);
    }
    let conf = hits(CONFIDENTIAL_MARKERS);
    if !conf.is_empty() {
        return (Sensitivity::Confidential, conf);
    }
    let smell = hits(CONFIDENTIAL_SMELLS);
    if !smell.is_empty() {
        return (Sensitivity::Confidential, smell);
    }
    if lower.contains("#public") {
        return (Sensitivity::Public, vec!["#public".into()]);
    }
    (Sensitivity::Internal, Vec::new())
}

/// (allow_persist, model_scope) per tier — see rule 68 Platform Trust Reality
fn sensitivity_policy(s: Sensitivity) -> (bool, &'static str) {
    match s {
        Sensitivity::Public | Sensitivity::Internal => (true, "any"),
        Sensitivity::Confidential                   => (false, "cloud-redacted"),
        Sensitivity::Sovereign                      => (false, "local-only"),
    }
}

/// Whether `needle` appears in `haystack` bounded by non-alphanumeric
/// characters (or the start/end of the string) on both sides. Plain
/// `str::contains` treats `"test"` as present inside `"latest"`,
/// `"fastest"`, `"contest"` — a purely explanatory question like "what's
/// the latest version" silently inflated the COMPLEX score via a
/// substring that has nothing to do with the intended "test" signal.
/// `char::is_alphanumeric` covers Vietnamese diacritic letters the same as
/// ASCII, so `"sửa"` inside `"sửa lại"` still matches while avoiding
/// false hits inside unrelated longer words.
fn contains_word_boundary(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let hay: Vec<char> = haystack.chars().collect();
    let need: Vec<char> = needle.chars().collect();
    if need.len() > hay.len() {
        return false;
    }
    for start in 0..=(hay.len() - need.len()) {
        if hay[start..start + need.len()] != need[..] {
            continue;
        }
        let before_ok = start == 0 || !hay[start - 1].is_alphanumeric();
        let end = start + need.len();
        let after_ok = end == hay.len() || !hay[end].is_alphanumeric();
        if before_ok && after_ok {
            return true;
        }
    }
    false
}

fn score_patterns(text: &str, patterns: &[Pattern]) -> (f32, Vec<String>) {
    let lower = text.to_lowercase();
    let mut total = 0f32;
    let mut signals = Vec::new();
    for p in patterns {
        if contains_word_boundary(&lower, p.keyword) {
            total += p.weight;
            signals.push(format!("{}({})", p.keyword, p.label));
        }
    }
    (total, signals)
}

pub fn classify(task: &str) -> RouteDecision {
    let (ext_score, ext_signals)  = score_patterns(task, EXTERNAL);
    let (cplx_score, cplx_signals) = score_patterns(task, COMPLEX);
    let (simp_score, simp_signals) = score_patterns(task, SIMPLE);

    let (sensitivity, sensitivity_signals) = classify_sensitivity(task);
    let (allow_persist, model_scope) = sensitivity_policy(sensitivity);

    // External wins if any strong signal present
    if ext_score >= 0.7 {
        let conf = (ext_score / 3.0).min(1.0);
        return RouteDecision {
            route:            Route::External,
            gate:             "confirm",
            confidence:       conf,
            reason:           "Task involves irreversible or cross-boundary action — human confirmation required".into(),
            matched_signals:  ext_signals,
            suggested_agents: &["security-engineer", "deployment-engineer"],
            sensitivity, allow_persist, model_scope, sensitivity_signals,
        };
    }

    // Complex if write/modify signals dominate
    if cplx_score > simp_score || cplx_score >= 0.8 {
        let conf = (cplx_score / 2.5).min(1.0);
        let lower = task.to_lowercase();
        let agents: &[&str] = if cplx_signals.iter().any(|s| s.contains("test") || s.contains("debug")) {
            &["qa-engineer", "debugger", "backend-developer"]
        } else if cplx_signals.iter().any(|s| s.contains("refactor") || s.contains("review") || s.contains("audit")) {
            &["refactoring-specialist", "code-reviewer-pro"]
        } else if lower.contains("auth") || lower.contains("security") || lower.contains("jwt") || lower.contains("oauth") || lower.contains("permission") || lower.contains("bảo mật") {
            &["security-engineer", "backend-developer"]
        } else if lower.contains("database") || lower.contains("sql") || lower.contains("migration") || lower.contains("schema") || lower.contains("query") || lower.contains("cơ sở dữ liệu") {
            &["database-expert", "backend-developer"]
        } else if lower.contains("ui") || lower.contains("frontend") || lower.contains("component") || lower.contains("style") || lower.contains("css") || lower.contains("giao diện") {
            &["frontend-developer", "ui-ux-designer"]
        } else if lower.contains("api") || lower.contains("endpoint") || lower.contains("route") || lower.contains("rest") || lower.contains("graphql") {
            &["backend-developer", "api-designer"]
        } else if lower.contains("deploy") || lower.contains("docker") || lower.contains("ci") || lower.contains("pipeline") || lower.contains("triển khai") {
            &["devops-engineer", "deployment-engineer"]
        } else {
            &["backend-developer", "frontend-developer", "fullstack-engineer"]
        };
        return RouteDecision {
            route:            Route::Complex,
            gate:             "harness",
            confidence:       conf,
            reason:           "Task requires code changes — spawning mini harness and agent dispatch".into(),
            matched_signals:  cplx_signals,
            suggested_agents: agents,
            sensitivity, allow_persist, model_scope, sensitivity_signals,
        };
    }

    // Default: simple
    let conf = if simp_score > 0.0 { (simp_score / 3.0).min(1.0) } else { 0.5 };
    RouteDecision {
        route:            Route::Simple,
        gate:             "auto",
        confidence:       conf,
        reason:           "Read-only or explanatory task — Yana handles directly".into(),
        matched_signals:  simp_signals,
        suggested_agents: &[],
        sensitivity, allow_persist, model_scope, sensitivity_signals,
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

fn cmd_classify(task: Option<String>, plain: bool) {
    let text = match task {
        Some(t) => t,
        None => {
            let mut buf = String::new();
            io::stdin().read_to_string(&mut buf).expect("failed to read stdin");
            buf.trim().to_string()
        }
    };

    if text.is_empty() {
        eprintln!("error: no task provided (pass as argument or via stdin)");
        std::process::exit(1);
    }

    let decision = classify(&text);

    if plain {
        let gate_icon = match decision.route {
            Route::Simple   => "✓",
            Route::Complex  => "⚙",
            Route::External => "⚠",
        };
        println!("{} {} [{:.0}%] — {}",
            gate_icon,
            match decision.route { Route::Simple => "SIMPLE", Route::Complex => "COMPLEX", Route::External => "EXTERNAL" },
            decision.confidence * 100.0,
            decision.reason,
        );
        if !decision.matched_signals.is_empty() {
            println!("  signals: {}", decision.matched_signals.join(", "));
        }
        if !decision.suggested_agents.is_empty() {
            println!("  agents:  {}", decision.suggested_agents.join(", "));
        }
        if decision.sensitivity != Sensitivity::Internal && decision.sensitivity != Sensitivity::Public {
            println!("  🔒 {:?} — persist={} scope={} ({})",
                decision.sensitivity,
                decision.allow_persist,
                decision.model_scope,
                decision.sensitivity_signals.join(", "),
            );
        }
    } else {
        println!("{}", serde_json::to_string_pretty(&decision).unwrap());
    }
}

fn cmd_patterns() {
    println!("=== EXTERNAL (gate: confirm) ===");
    for p in EXTERNAL {
        println!("  [{:.1}] {:30} — {}", p.weight, p.keyword, p.label);
    }
    println!("\n=== COMPLEX (gate: harness) ===");
    for p in COMPLEX {
        println!("  [{:.1}] {:30} — {}", p.weight, p.keyword, p.label);
    }
    println!("\n=== SIMPLE (gate: auto) ===");
    for p in SIMPLE {
        println!("  [{:.1}] {:30} — {}", p.weight, p.keyword, p.label);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_question() {
        let d = classify("explain how the auth middleware works");
        assert_eq!(d.route, Route::Simple);
        assert_eq!(d.gate, "auto");
    }

    #[test]
    fn complex_implementation() {
        let d = classify("implement OAuth2 login with refresh tokens");
        assert_eq!(d.route, Route::Complex);
        assert_eq!(d.gate, "harness");
    }

    #[test]
    fn external_push() {
        let d = classify("git push origin main and create release");
        assert_eq!(d.route, Route::External);
        assert_eq!(d.gate, "confirm");
    }

    #[test]
    fn external_deploy() {
        let d = classify("deploy to production");
        assert_eq!(d.route, Route::External);
        assert_eq!(d.gate, "confirm");
    }

    #[test]
    fn vietnamese_simple() {
        let d = classify("xem git log 10 commit gần nhất");
        assert_eq!(d.route, Route::Simple);
    }

    #[test]
    fn vietnamese_complex() {
        let d = classify("sửa bug auth middleware không trả 401");
        assert_eq!(d.route, Route::Complex);
    }

    #[test]
    fn empty_defaults_simple() {
        let d = classify("what time is it");
        assert_eq!(d.route, Route::Simple);
    }

    // ── Rule 68 — sensitivity tiers ──────────────────────────────────────────

    #[test]
    fn sovereign_marker_vi() {
        let d = classify("chuyện này chỉ mình anh biết: kế hoạch năm sau");
        assert_eq!(d.sensitivity, Sensitivity::Sovereign);
        assert_eq!(d.model_scope, "local-only");
        assert!(!d.allow_persist);
    }

    #[test]
    fn confidential_explicit_marker() {
        let d = classify("đừng ghi lại nhé — sắp có thay đổi nhân sự");
        assert_eq!(d.sensitivity, Sensitivity::Confidential);
        assert_eq!(d.model_scope, "cloud-redacted");
        assert!(!d.allow_persist);
    }

    #[test]
    fn confidential_smell_deal() {
        let d = classify("phân tích thương vụ sáp nhập chưa công bố");
        assert_eq!(d.sensitivity, Sensitivity::Confidential);
        assert!(!d.allow_persist);
    }

    #[test]
    fn security_work_stays_internal() {
        // "bảo mật" (security work) must NOT trigger the confidential tier
        let d = classify("sửa bug bảo mật trong auth middleware");
        assert_eq!(d.sensitivity, Sensitivity::Internal);
        assert!(d.allow_persist);
        assert_eq!(d.model_scope, "any");
    }

    #[test]
    fn default_tier_is_internal() {
        let d = classify("explain how the router works");
        assert_eq!(d.sensitivity, Sensitivity::Internal);
        assert!(d.allow_persist);
    }

    #[test]
    fn hashtag_confidential() {
        let d = classify("#mật ghi chú về buổi họp đối tác");
        assert_eq!(d.sensitivity, Sensitivity::Confidential);
    }

    // ── Wave 1 (2026-07-23) — unanchored substring match fix ────────────────
    // score_patterns() used to match keywords via plain `str::contains`, so
    // e.g. the COMPLEX keyword "test" matched inside "latest"/"fastest"/
    // "contest" — a purely explanatory question could be misrouted into the
    // Complex/harness path over a false signal that has nothing to do with
    // testing. docs/PLATFORM-READINESS-WAVE0.md documents the finding this
    // fix closes.

    #[test]
    fn latest_does_not_trigger_test_keyword() {
        let d = classify("what's the latest version of yana-ai");
        assert_eq!(d.route, Route::Simple, "'latest' must not false-match the COMPLEX 'test' keyword");
    }

    #[test]
    fn fastest_does_not_trigger_test_keyword() {
        let d = classify("what is the fastest way to read this file");
        assert!(
            !d.matched_signals.iter().any(|s| s.starts_with("test(")),
            "'fastest' must not false-match the COMPLEX 'test' keyword: {:?}",
            d.matched_signals
        );
    }

    #[test]
    fn preview_does_not_trigger_view_keyword() {
        let d = classify("show me a preview of the changelog");
        assert!(
            !d.matched_signals.iter().any(|s| s.starts_with("view(")),
            "'preview' must not false-match the SIMPLE 'view' keyword: {:?}",
            d.matched_signals
        );
    }

    #[test]
    fn already_does_not_trigger_read_keyword() {
        let d = classify("explain how the already-deployed service differs");
        assert!(
            !d.matched_signals.iter().any(|s| s.starts_with("read(")),
            "'already' must not false-match the SIMPLE 'read' keyword: {:?}",
            d.matched_signals
        );
    }

    #[test]
    fn genuine_test_keyword_still_matches() {
        let d = classify("write a test for the login flow");
        assert!(
            d.matched_signals.iter().any(|s| s.starts_with("test(")),
            "a genuine standalone 'test' word must still match: {:?}",
            d.matched_signals
        );
        assert_eq!(d.route, Route::Complex);
    }

    #[test]
    fn genuine_review_keyword_still_matches_at_string_boundaries() {
        let d = classify("review");
        assert!(
            d.matched_signals.iter().any(|s| s.starts_with("review(")),
            "a single-word task equal to the keyword itself must still match: {:?}",
            d.matched_signals
        );
    }

    #[test]
    fn multi_word_keyword_still_matches_with_internal_space() {
        let d = classify("please git push origin main");
        assert_eq!(d.route, Route::External, "multi-word keywords like 'git push' must still match across their internal space");
    }
}
