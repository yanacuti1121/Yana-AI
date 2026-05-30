use anyhow::Result;
use clap::Subcommand;
use regex::Regex;
use std::collections::HashMap;
use walkdir::WalkDir;

// ── Patterns ─────────────────────────────────────────────────────────────────

static SECRET_PATTERNS: &[(&str, &str, &str)] = &[
    (r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}"#, "API Key hardcoded", "HIGH"),
    (r#"(?i)(secret[_-]?key|client_secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}"#, "Secret Key hardcoded", "HIGH"),
    (r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"][^'"]{6,}['"]"#, "Password hardcoded", "HIGH"),
    (r#"sk-[A-Za-z0-9]{32,}"#, "OpenAI API key", "CRITICAL"),
    (r#"gh[ps]_[A-Za-z0-9]{36}"#, "GitHub token", "CRITICAL"),
    (r#"AKIA[0-9A-Z]{16}"#, "AWS Access Key", "CRITICAL"),
    (r#"(?i)bearer\s+[A-Za-z0-9\-._~+/]{20,}"#, "Bearer token", "HIGH"),
    (r#"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"#, "Private key", "CRITICAL"),
    (r#"(?i)(database_url|db_url)\s*=\s*['"](postgres|mysql|mongodb)[^'"]{10,}"#, "DB URL with credentials", "HIGH"),
];

static CODE_PATTERNS: &[(&str, &str, &str)] = &[
    (r#"eval\s*\("#, "eval() usage", "MEDIUM"),
    (r#"exec\s*\("#, "exec() usage", "MEDIUM"),
    (r#"subprocess\.(call|run|Popen)\s*\([^)]*shell\s*=\s*True"#, "shell=True subprocess", "HIGH"),
    (r#"os\.system\s*\("#, "os.system() call", "MEDIUM"),
    (r#"child_process\.exec\s*\("#, "child_process.exec (no shell guard)", "MEDIUM"),
    (r#"dangerouslySetInnerHTML"#, "dangerouslySetInnerHTML (XSS risk)", "HIGH"),
    (r#"innerHTML\s*="#, "innerHTML assignment (XSS risk)", "MEDIUM"),
    (r#"(?i)TODO.*(?:fixme|hack|xxx|security|vuln)"#, "Security TODO comment", "LOW"),
    (r#"(?i)#\s*nosec|#\s*noqa\s*S"#, "Security check bypass comment", "LOW"),
];

static SUPPLY_CHAIN_PATTERNS: &[(&str, &str, &str)] = &[
    (r#"\|\s*(bash|sh|zsh|python3?|node|perl)\b"#, "Pipe to interpreter (RCE risk)", "CRITICAL"),
    (r#"curl[^|]*\|"#, "curl pipe (potential RCE)", "HIGH"),
    (r#"wget[^|]*\|"#, "wget pipe (potential RCE)", "HIGH"),
    (r#"base64\s+-d[^|]*\|"#, "base64 decode pipe", "HIGH"),
    (r#"source\s+<\("#, "source <() process substitution", "HIGH"),
    (r#"eval\s+['"]\$\("#, "eval with subshell", "HIGH"),
];

// ── Finding ───────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
struct Finding {
    file:     String,
    line:     usize,
    rule:     String,
    severity: String,
    snippet:  String,
    category: String,
}

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Subcommand, Debug)]
pub enum HuntAction {
    /// Run security hunt (secrets, code, deps, supply-chain)
    Run {
        #[arg(default_value = ".")] target: String,
        /// Categories to scan
        #[arg(value_enum, default_values_t = vec![Category::All])]
        categories: Vec<Category>,
        #[arg(long)] json: bool,
        #[arg(long, value_name = "LEVEL")] fail_on: Option<String>,
    },
}

#[derive(Debug, Clone, clap::ValueEnum, PartialEq)]
pub enum Category {
    Secrets,
    Code,
    #[value(name = "supply-chain")]
    SupplyChain,
    Deps,
    All,
}

pub fn dispatch(action: HuntAction) {
    let result = match action {
        HuntAction::Run { target, categories, json, fail_on } => {
            cmd_hunt(&target, &categories, json, fail_on.as_deref())
        }
    };
    if let Err(e) = result {
        eprintln!("[hunt] error: {e}");
        std::process::exit(1);
    }
}

fn cmd_hunt(target: &str, cats: &[Category], as_json: bool, fail_on: Option<&str>) -> Result<()> {
    let run_all  = cats.contains(&Category::All);
    let mut all_findings: Vec<Finding> = Vec::new();

    if run_all || cats.contains(&Category::Secrets) {
        all_findings.extend(scan_patterns(target, SECRET_PATTERNS, "secrets", &["py","ts","js","env","sh","yml","yaml","json","toml","rs"]));
    }
    if run_all || cats.contains(&Category::Code) {
        all_findings.extend(scan_patterns(target, CODE_PATTERNS, "code", &["py","ts","js","tsx","jsx","rs","sh"]));
    }
    if run_all || cats.contains(&Category::SupplyChain) {
        all_findings.extend(scan_patterns(target, SUPPLY_CHAIN_PATTERNS, "supply-chain", &["sh","bash","yml","yaml","Makefile","Dockerfile"]));
    }
    if run_all || cats.contains(&Category::Deps) {
        all_findings.extend(hunt_deps(target));
    }

    if as_json {
        println!("{}", serde_json::to_string_pretty(&all_findings)?);
    } else {
        render_findings(&all_findings);
    }

    // Exit code
    if let Some(level) = fail_on {
        let order = |s: &str| match s.to_lowercase().as_str() {
            "critical" => 0usize, "high" => 1, "medium" => 2, "low" => 3, _ => 4,
        };
        let threshold = order(level);
        let has_fail = all_findings.iter().any(|f| order(&f.severity) <= threshold);
        if has_fail { std::process::exit(1); }
    }
    Ok(())
}

fn scan_patterns(target: &str, patterns: &[(&str, &str, &str)], category: &str, exts: &[&str]) -> Vec<Finding> {
    let compiled: Vec<(Regex, &str, &str)> = patterns.iter()
        .filter_map(|(pat, name, sev)| Regex::new(pat).ok().map(|r| (r, *name, *sev)))
        .collect();

    let mut findings = Vec::new();
    for entry in WalkDir::new(target).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() { continue; }
        if skip_path(path) { continue; }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !exts.is_empty() && !exts.contains(&ext) { continue; }

        let content = match std::fs::read_to_string(path) { Ok(c) => c, Err(_) => continue };
        let rel = path.strip_prefix(target).map(|p| p.display().to_string()).unwrap_or_default();

        let mut per_rule: HashMap<&str, usize> = HashMap::new();
        for (line_no, line) in content.lines().enumerate() {
            for (re, name, sev) in &compiled {
                if *per_rule.entry(name).or_default() >= 3 { continue; }
                if re.is_match(line) {
                    *per_rule.entry(name).or_default() += 1;
                    findings.push(Finding {
                        file: rel.clone(),
                        line: line_no + 1,
                        rule: name.to_string(),
                        severity: sev.to_string(),
                        snippet: line.trim().chars().take(120).collect(),
                        category: category.to_string(),
                    });
                }
            }
        }
    }
    findings
}

fn hunt_deps(target: &str) -> Vec<Finding> {
    let mut findings = Vec::new();

    // Check package.json for known risky patterns
    let pkg = std::path::Path::new(target).join("package.json");
    if let Ok(s) = std::fs::read_to_string(&pkg) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            for section in &["dependencies", "devDependencies"] {
                if let Some(deps) = v[section].as_object() {
                    for (name, ver) in deps {
                        let ver_str = ver.as_str().unwrap_or("");
                        if ver_str == "*" || ver_str == "latest" {
                            findings.push(Finding {
                                file: "package.json".into(),
                                line: 0,
                                rule: "Unpinned dependency".into(),
                                severity: "MEDIUM".into(),
                                snippet: format!("{}: {}", name, ver_str),
                                category: "deps".into(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Check requirements.txt for unpinned deps
    let req = std::path::Path::new(target).join("requirements.txt");
    if let Ok(s) = std::fs::read_to_string(&req) {
        for (i, line) in s.lines().enumerate() {
            let l = line.trim();
            if l.is_empty() || l.starts_with('#') { continue; }
            if !l.contains("==") && !l.contains(">=") {
                findings.push(Finding {
                    file: "requirements.txt".into(),
                    line: i + 1,
                    rule: "Unpinned Python dep".into(),
                    severity: "LOW".into(),
                    snippet: l.to_string(),
                    category: "deps".into(),
                });
            }
        }
    }
    findings
}

fn render_findings(findings: &[Finding]) {
    if findings.is_empty() {
        println!("\n  [hunt] No findings. Clean.\n");
        return;
    }
    let mut by_cat: HashMap<&str, Vec<&Finding>> = HashMap::new();
    for f in findings { by_cat.entry(f.category.as_str()).or_default().push(f); }

    let sev_order = |s: &str| match s { "CRITICAL" => 0, "HIGH" => 1, "MEDIUM" => 2, _ => 3 };
    println!("\n  [hunt] {} finding(s)\n", findings.len());

    let mut cats: Vec<&str> = by_cat.keys().copied().collect();
    cats.sort();
    for cat in cats {
        let mut items = by_cat[cat].to_vec();
        items.sort_by_key(|f| sev_order(&f.severity));
        println!("  ── {} ──", cat.to_uppercase());
        for f in items {
            let sev_color = match f.severity.as_str() {
                "CRITICAL" => "\x1b[1;31m",
                "HIGH"     => "\x1b[31m",
                "MEDIUM"   => "\x1b[33m",
                _          => "\x1b[36m",
            };
            println!("  {}[{}]\x1b[0m {}:{} — {}",
                sev_color, f.severity, f.file, f.line, f.rule);
            if !f.snippet.is_empty() {
                println!("      {}", f.snippet);
            }
        }
        println!();
    }
}

fn skip_path(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        matches!(c.as_os_str().to_str().unwrap_or(""),
            "node_modules" | ".git" | "target" | "__pycache__" | ".yamtam" | "dist" | "build")
    })
}
