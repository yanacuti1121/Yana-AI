use anyhow::Result;
use clap::Subcommand;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum FixAction {
    /// Auto-apply a safe fix for a specific finding ID
    Apply {
        rule_id: String,
        #[arg(default_value = ".")] target: String,
        #[arg(long)] dry_run: bool,
    },
    /// List auto-fixable rules
    List,
}

pub fn dispatch(action: FixAction) {
    let result = match action {
        FixAction::Apply { rule_id, target, dry_run } => cmd_fix(&rule_id, &target, dry_run),
        FixAction::List => { cmd_list(); Ok(()) }
    };
    if let Err(e) = result {
        eprintln!("[fix] error: {e}");
        std::process::exit(1);
    }
}

fn cmd_list() {
    println!("\n  Auto-fixable rules:\n");
    for (id, desc, safe) in FIXABLE_RULES {
        let icon = if *safe { "✓" } else { "⚠" };
        println!("  {}  {:<12}  {}", icon, id, desc);
    }
    println!();
}

static FIXABLE_RULES: &[(&str, &str, bool)] = &[
    ("AC001", "Create .claude/settings.json with safe defaults",  true),
    ("AC002", "Add .env* to .gitignore",                          true),
    ("AC003", "Add timeout-minutes to GitHub workflow jobs",       true),
    ("CI007", "Add environment gate to publish/deploy jobs",       true),
    ("MCP001","Add read-only annotation to filesystem MCP server", true),
];

fn validate_target(target: &str) -> Result<()> {
    let p = Path::new(target);
    if p.is_absolute() {
        anyhow::bail!("target must be a relative path, got absolute: '{}'", target);
    }
    for component in p.components() {
        if matches!(component, std::path::Component::ParentDir) {
            anyhow::bail!("target must not contain '..': '{}'", target);
        }
    }
    Ok(())
}

fn cmd_fix(rule_id: &str, target: &str, dry_run: bool) -> Result<()> {
    validate_target(target)?;
    match rule_id.to_uppercase().as_str() {
        "AC001" => fix_ac001(target, dry_run),
        "AC002" => fix_ac002(target, dry_run),
        "AC003" => fix_ac003(target, dry_run),
        "CI007" => fix_ci007(target, dry_run),
        "MCP001"=> fix_mcp001(target, dry_run),
        other   => anyhow::bail!("No auto-fix for '{}'. Run: yamtam-rt fix list", other),
    }
}

fn fix_ac001(target: &str, dry_run: bool) -> Result<()> {
    let dir  = Path::new(target).join(".claude");
    let path = dir.join("settings.json");
    if path.exists() {
        println!("[fix/AC001] .claude/settings.json already exists — skipping");
        return Ok(());
    }
    let content = serde_json::to_string_pretty(&serde_json::json!({
        "permissions": {
            "allow": [],
            "deny":  ["Bash(rm -rf*)", "Bash(git push --force*)"]
        }
    }))?;
    if dry_run {
        println!("[dry-run] would create .claude/settings.json:\n{}", content);
    } else {
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&path, content)?;
        println!("[fix/AC001] Created .claude/settings.json");
    }
    Ok(())
}

fn fix_ac002(target: &str, dry_run: bool) -> Result<()> {
    let path = Path::new(target).join(".gitignore");
    let entries = "\n# Environment files\n.env\n.env.*\n*.env\n*.pem\n*.key\n";
    if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        if content.contains(".env") {
            println!("[fix/AC002] .gitignore already has .env entries — skipping");
            return Ok(());
        }
        if dry_run {
            println!("[dry-run] would append to .gitignore:\n{}", entries);
        } else {
            let mut f = std::fs::OpenOptions::new().append(true).open(&path)?;
            use std::io::Write;
            f.write_all(entries.as_bytes())?;
            println!("[fix/AC002] Appended .env entries to .gitignore");
        }
    } else {
        if dry_run {
            println!("[dry-run] would create .gitignore with .env entries");
        } else {
            std::fs::write(&path, format!("# gitignore{}", entries))?;
            println!("[fix/AC002] Created .gitignore with .env entries");
        }
    }
    Ok(())
}

fn fix_ac003(target: &str, dry_run: bool) -> Result<()> {
    let wf_dir = Path::new(target).join(".github/workflows");
    if !wf_dir.exists() {
        println!("[fix/AC003] No .github/workflows/ found");
        return Ok(());
    }
    let mut fixed = 0usize;
    for entry in std::fs::read_dir(&wf_dir)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("yml") &&
           path.extension().and_then(|e| e.to_str()) != Some("yaml") { continue; }
        let content = std::fs::read_to_string(&path)?;
        if content.contains("timeout-minutes:") { continue; }
        // Add timeout after first `runs-on:` line
        let patched = content.lines().map(|l| {
            if l.trim().starts_with("runs-on:") {
                format!("{}\n      timeout-minutes: 30", l)
            } else {
                l.to_string()
            }
        }).collect::<Vec<_>>().join("\n");
        if dry_run {
            println!("[dry-run] would add timeout-minutes: 30 to {}", path.display());
        } else {
            std::fs::write(&path, patched)?;
            println!("[fix/AC003] Added timeout-minutes: 30 to {}", path.file_name().unwrap_or_default().to_string_lossy());
            fixed += 1;
        }
    }
    if fixed == 0 && !dry_run { println!("[fix/AC003] No workflows needed patching"); }
    Ok(())
}

fn fix_ci007(target: &str, dry_run: bool) -> Result<()> {
    let wf_dir = Path::new(target).join(".github/workflows");
    if !wf_dir.exists() {
        println!("[fix/CI007] No .github/workflows/ found");
        return Ok(());
    }
    let publish_patterns = ["npm publish", "cargo publish", "gh release", "pypi", "pip upload"];
    for entry in std::fs::read_dir(&wf_dir)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("yml") &&
           path.extension().and_then(|e| e.to_str()) != Some("yaml") { continue; }
        let content = std::fs::read_to_string(&path)?;
        if !publish_patterns.iter().any(|p| content.contains(p)) { continue; }
        if content.contains("environment:") { continue; }
        // Insert environment: production before the first publish step
        let patched = content.lines().map(|l| {
            if publish_patterns.iter().any(|p| l.contains(p)) {
                format!("      environment: production\n{}", l)
            } else { l.to_string() }
        }).collect::<Vec<_>>().join("\n");
        if dry_run {
            println!("[dry-run] would add environment: production to {}", path.display());
        } else {
            std::fs::write(&path, patched)?;
            println!("[fix/CI007] Added environment: production gate to {}", path.file_name().unwrap_or_default().to_string_lossy());
        }
    }
    Ok(())
}

fn fix_mcp001(target: &str, dry_run: bool) -> Result<()> {
    let paths = [".mcp.json", ".claude/mcp.json"];
    for p in &paths {
        let full = Path::new(target).join(p);
        if !full.exists() { continue; }
        let content = std::fs::read_to_string(&full)?;
        let mut data: serde_json::Value = serde_json::from_str(&content)?;
        let key = if data.get("mcpServers").is_some() { "mcpServers" } else { "servers" };
        if let Some(servers) = data[key].as_object_mut() {
            for (name, cfg) in servers.iter_mut() {
                if name.contains("file") || name.contains("fs") {
                    if cfg["args"].as_array().map(|a| a.iter().any(|v| v.as_str() == Some("--read-only"))).unwrap_or(false) {
                        continue;
                    }
                    if dry_run {
                        println!("[dry-run] would add --read-only to MCP server '{}'", name);
                    } else if let Some(args) = cfg["args"].as_array_mut() {
                        args.push(serde_json::json!("--read-only"));
                    }
                }
            }
        }
        if !dry_run {
            std::fs::write(&full, serde_json::to_string_pretty(&data)?)?;
            println!("[fix/MCP001] Added --read-only to filesystem MCP servers in {}", p);
        }
        return Ok(());
    }
    println!("[fix/MCP001] No MCP config found");
    Ok(())
}
