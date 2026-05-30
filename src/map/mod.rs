use anyhow::Result;
use clap::Subcommand;
use serde_json::Value;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum MapAction {
    /// Show agent blast radius — what the AI agent can reach
    Show {
        #[arg(default_value = ".")] target: String,
        #[arg(long)] json: bool,
    },
}

pub fn dispatch(action: MapAction) {
    let result = match action {
        MapAction::Show { target, json } => cmd_map(&target, json),
    };
    if let Err(e) = result {
        eprintln!("[map] error: {e}");
        std::process::exit(1);
    }
}

#[derive(Debug, serde::Serialize)]
struct BlastMap {
    claude:   ClaudeAccess,
    mcps:     Vec<McpServer>,
    workflows: Vec<WfPermissions>,
    risk:     String,
}

#[derive(Debug, serde::Serialize, Default)]
struct ClaudeAccess {
    found:       bool,
    shell:       AccessLevel,
    file_read:   AccessLevel,
    file_write:  AccessLevel,
    git:         AccessLevel,
    network:     AccessLevel,
    dangerous:   bool,
}

#[derive(Debug, serde::Serialize, Default)]
struct AccessLevel { level: String, detail: String }

#[derive(Debug, serde::Serialize)]
struct McpServer { name: String, transport: String, capabilities: Vec<String>, risk: String }

#[derive(Debug, serde::Serialize)]
struct WfPermissions { file: String, write_perms: Vec<String>, has_secrets: bool, risk: String }

fn cmd_map(target: &str, as_json: bool) -> Result<()> {
    let claude   = scan_claude_settings(target);
    let mcps     = scan_mcp(target);
    let workflows = scan_workflows(target);
    let risk     = overall_risk(&claude, &mcps, &workflows);

    if as_json {
        let map = BlastMap { claude, mcps, workflows, risk };
        println!("{}", serde_json::to_string_pretty(&map)?);
        return Ok(());
    }

    print_map(target, &claude, &mcps, &workflows, &risk);
    Ok(())
}

fn scan_claude_settings(target: &str) -> ClaudeAccess {
    let path = Path::new(target).join(".claude/settings.json");
    if !path.exists() { return ClaudeAccess::default(); }
    let Ok(data) = std::fs::read_to_string(&path).and_then(|s| {
        serde_json::from_str::<Value>(&s).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }) else { return ClaudeAccess::default(); };

    let mut ca = ClaudeAccess { found: true, ..Default::default() };

    // Check allowedTools
    if let Some(tools) = data["allowedTools"].as_array() {
        let tools_str: Vec<&str> = tools.iter().filter_map(|v| v.as_str()).collect();
        if tools_str.contains(&"Bash") || tools_str.iter().any(|t| t.contains("Bash")) {
            ca.shell = AccessLevel { level: "HIGH".into(), detail: "Bash tool allowed".into() };
            ca.dangerous = true;
        }
        if tools_str.contains(&"Read") {
            ca.file_read = AccessLevel { level: "MEDIUM".into(), detail: "Read tool allowed".into() };
        }
        if tools_str.iter().any(|t| t.contains("Write") || t.contains("Edit")) {
            ca.file_write = AccessLevel { level: "HIGH".into(), detail: "Write/Edit tool allowed".into() };
        }
    }

    // Check permissions
    if let Some(perms) = data["permissions"].as_object() {
        if let Some(allow) = perms["allow"].as_array() {
            let allow_str: Vec<String> = allow.iter().filter_map(|v| v.as_str()).map(String::from).collect();
            if allow_str.iter().any(|s| s.contains("Bash")) {
                ca.shell = AccessLevel { level: "HIGH".into(), detail: format!("{} Bash patterns allowed", allow_str.iter().filter(|s| s.contains("Bash")).count()) };
                ca.dangerous = true;
            }
            if allow_str.iter().any(|s| s.contains("git push") || s.contains("git push")) {
                ca.git = AccessLevel { level: "HIGH".into(), detail: "git push allowed".into() };
            }
            if allow_str.iter().any(|s| s.contains("WebFetch") || s.contains("WebSearch")) {
                ca.network = AccessLevel { level: "MEDIUM".into(), detail: "network access allowed".into() };
            }
        }
    }
    ca
}

fn scan_mcp(target: &str) -> Vec<McpServer> {
    let paths = [".mcp.json", ".claude/mcp.json"];
    for p in &paths {
        let full = Path::new(target).join(p);
        if !full.exists() { continue; }
        let Ok(data) = std::fs::read_to_string(&full).and_then(|s| {
            serde_json::from_str::<Value>(&s).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        }) else { continue };

        let mut servers = Vec::new();
        let mcps = data["mcpServers"].as_object().or(data["servers"].as_object());
        if let Some(map) = mcps {
            for (name, cfg) in map {
                let transport = cfg["transport"].as_str()
                    .or(cfg["command"].as_str().map(|_| "stdio"))
                    .unwrap_or("unknown").to_string();
                let caps = infer_mcp_capabilities(name, cfg);
                let risk = if caps.iter().any(|c| c.contains("write") || c.contains("exec")) { "HIGH" }
                    else if caps.iter().any(|c| c.contains("read")) { "MEDIUM" }
                    else { "LOW" };
                servers.push(McpServer { name: name.clone(), transport, capabilities: caps, risk: risk.into() });
            }
        }
        return servers;
    }
    vec![]
}

fn infer_mcp_capabilities(name: &str, cfg: &Value) -> Vec<String> {
    let mut caps = Vec::new();
    let n = name.to_lowercase();
    if n.contains("file") || n.contains("fs") { caps.push("file-read".into()); caps.push("file-write".into()); }
    if n.contains("github") || n.contains("git") { caps.push("git-read".into()); caps.push("git-write".into()); }
    if n.contains("postgres") || n.contains("sqlite") || n.contains("db") { caps.push("db-read".into()); caps.push("db-write".into()); }
    if n.contains("browser") || n.contains("playwright") { caps.push("browser-exec".into()); }
    if n.contains("search") || n.contains("web") { caps.push("network-read".into()); }
    // Check args for clues
    if let Some(args) = cfg["args"].as_array() {
        for a in args {
            if let Some(s) = a.as_str() {
                if s.contains("write") { caps.push("write".into()); }
                if s.contains("read-only") { caps.retain(|c: &String| !c.contains("write")); }
            }
        }
    }
    if caps.is_empty() { caps.push("unknown".into()); }
    caps
}

fn scan_workflows(target: &str) -> Vec<WfPermissions> {
    let wf_dir = Path::new(target).join(".github/workflows");
    if !wf_dir.exists() { return vec![]; }
    let mut results = Vec::new();
    for entry in std::fs::read_dir(&wf_dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("yml") &&
           path.extension().and_then(|e| e.to_str()) != Some("yaml") { continue; }
        let Ok(content) = std::fs::read_to_string(&path) else { continue };
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let mut write_perms = Vec::new();
        for perm in &["contents: write", "packages: write", "id-token: write", "deployments: write"] {
            if content.contains(perm) { write_perms.push(perm.split(':').next().unwrap_or("").trim().to_string()); }
        }
        let has_secrets = content.contains("secrets.") || content.contains("${{ secrets");
        let risk = if write_perms.len() >= 2 { "HIGH" } else if !write_perms.is_empty() || has_secrets { "MEDIUM" } else { "LOW" };
        results.push(WfPermissions { file: name, write_perms, has_secrets, risk: risk.into() });
    }
    results
}

fn overall_risk(claude: &ClaudeAccess, mcps: &[McpServer], wfs: &[WfPermissions]) -> String {
    if claude.dangerous || mcps.iter().any(|m| m.risk == "HIGH") || wfs.iter().any(|w| w.risk == "HIGH") {
        return "HIGH".into();
    }
    if wfs.iter().any(|w| w.risk == "MEDIUM") || mcps.iter().any(|m| m.risk == "MEDIUM") {
        return "MEDIUM".into();
    }
    "LOW".into()
}

fn print_map(target: &str, claude: &ClaudeAccess, mcps: &[McpServer], wfs: &[WfPermissions], risk: &str) {
    let risk_color = match risk { "HIGH" | "CRITICAL" => "\x1b[31m", "MEDIUM" => "\x1b[33m", _ => "\x1b[32m" };
    println!("\n  Agent Blast Radius Map — {}\n", target);
    println!("  Overall risk: {}{}\x1b[0m\n", risk_color, risk);

    println!("  ── Claude Settings ──");
    if !claude.found {
        println!("    not found");
    } else {
        let print_level = |label: &str, al: &AccessLevel| {
            let color = match al.level.as_str() { "HIGH"|"CRITICAL" => "\x1b[31m", "MEDIUM" => "\x1b[33m", "LOW" => "\x1b[32m", _ => "\x1b[2m" };
            println!("    {:<14} {}{:<8}\x1b[0m  {}", label, color, al.level, al.detail);
        };
        print_level("shell",      &claude.shell);
        print_level("file_read",  &claude.file_read);
        print_level("file_write", &claude.file_write);
        print_level("git",        &claude.git);
        print_level("network",    &claude.network);
    }

    if !mcps.is_empty() {
        println!("\n  ── MCP Servers ({}) ──", mcps.len());
        for m in mcps {
            let color = match m.risk.as_str() { "HIGH" => "\x1b[31m", "MEDIUM" => "\x1b[33m", _ => "\x1b[32m" };
            println!("    {}[{}]\x1b[0m  {}  ({})", color, m.risk, m.name, m.capabilities.join(", "));
        }
    }

    if !wfs.is_empty() {
        println!("\n  ── GitHub Workflows ({}) ──", wfs.len());
        for w in wfs {
            let color = match w.risk.as_str() { "HIGH" => "\x1b[31m", "MEDIUM" => "\x1b[33m", _ => "\x1b[32m" };
            let perms = if w.write_perms.is_empty() { "no write perms".to_string() } else { w.write_perms.join(", ") };
            println!("    {}[{}]\x1b[0m  {}  {}{}", color, w.risk, w.file, perms,
                if w.has_secrets { " + secrets" } else { "" });
        }
    }
    println!();
}
