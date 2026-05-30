use anyhow::Result;
use clap::Subcommand;
use serde_json::Value;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum SpecAction {
    /// Validate a task spec file against the yamtam spec schema
    Validate {
        file: String,
        #[arg(long)] json: bool,
    },
    /// Show the spec schema
    Schema,
}

pub fn dispatch(action: SpecAction) {
    let result = match action {
        SpecAction::Validate { file, json } => cmd_validate(&file, json),
        SpecAction::Schema => { print_schema(); Ok(()) }
    };
    if let Err(e) = result {
        eprintln!("[spec] error: {e}");
        std::process::exit(1);
    }
}

fn cmd_validate(file: &str, as_json: bool) -> Result<()> {
    let path = Path::new(file);
    anyhow::ensure!(path.exists(), "File not found: {}", file);

    let content = std::fs::read_to_string(path)?;
    let spec: Value = serde_json::from_str(&content)
        .map_err(|e| anyhow::anyhow!("Invalid JSON: {}", e))?;

    let findings = validate_spec(&spec);
    let status = if findings.iter().any(|f: &Finding| f.severity == "error") { "invalid" } else { "valid" };
    let exit_code: i32 = if status == "invalid" { 2 } else { 0 };

    if as_json {
        let out = serde_json::json!({
            "status": status,
            "exit_code": exit_code,
            "file": file,
            "findings": findings.iter().map(|f| serde_json::json!({
                "id": f.id, "severity": f.severity, "message": f.message
            })).collect::<Vec<_>>()
        });
        println!("{}", serde_json::to_string_pretty(&out)?);
    } else {
        println!("\n  Spec: {}\n", file);
        if findings.is_empty() {
            println!("  \x1b[32m✓ Valid spec\x1b[0m\n");
        } else {
            for f in &findings {
                let (icon, color) = if f.severity == "error" { ("✗", "\x1b[31m") } else { ("⚠", "\x1b[33m") };
                println!("  {}{} [{}] {}\x1b[0m", color, icon, f.id, f.message);
            }
            println!();
            if status == "invalid" { println!("  \x1b[31mSpec is invalid\x1b[0m\n"); }
            else { println!("  \x1b[33mSpec valid with warnings\x1b[0m\n"); }
        }
    }
    std::process::exit(exit_code);
}

struct Finding { id: String, severity: &'static str, message: String }

fn validate_spec(spec: &Value) -> Vec<Finding> {
    let mut f = Vec::new();
    let req_str = |key: &str| -> Option<Finding> {
        if spec.get(key).and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false) {
            None
        } else {
            Some(Finding { id: format!("SPEC001-{}", key.to_uppercase()),
                severity: "error", message: format!("Missing required field: '{}'", key) })
        }
    };
    for key in &["id", "goal"] { if let Some(e) = req_str(key) { f.push(e); } }

    // tasks: must be non-empty array
    match spec.get("tasks") {
        Some(Value::Array(arr)) if !arr.is_empty() => {}
        Some(Value::Array(_)) => f.push(Finding { id: "SPEC002".into(), severity: "error", message: "tasks array is empty".into() }),
        _ => f.push(Finding { id: "SPEC002".into(), severity: "error", message: "Missing required field: 'tasks'".into() }),
    }

    // tasks each need id + description
    if let Some(Value::Array(tasks)) = spec.get("tasks") {
        for (i, task) in tasks.iter().enumerate() {
            for field in &["id", "description"] {
                if task.get(field).and_then(|v| v.as_str()).map(|s| s.is_empty()).unwrap_or(true) {
                    f.push(Finding {
                        id: format!("SPEC003-T{}", i),
                        severity: "error",
                        message: format!("Task {} missing '{}'", i, field),
                    });
                }
            }
        }
    }

    // acceptance_criteria: recommended
    if spec.get("acceptance_criteria").is_none() {
        f.push(Finding { id: "SPEC004".into(), severity: "warning", message: "Missing recommended field: 'acceptance_criteria'".into() });
    }

    // scope: recommended
    if spec.get("scope").is_none() {
        f.push(Finding { id: "SPEC005".into(), severity: "warning", message: "Missing recommended field: 'scope' (list of files)".into() });
    }
    f
}

fn print_schema() {
    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "id":          "string (required) — unique spec identifier",
        "goal":        "string (required) — what this spec accomplishes",
        "tasks": [{
            "id":          "string (required)",
            "description": "string (required)",
            "acceptance":  "string (optional)"
        }],
        "acceptance_criteria": ["string (recommended)"],
        "scope":       ["string (recommended) — file paths in scope"],
        "constraints": ["string (optional)"],
        "notes":       "string (optional)"
    })).unwrap());
}
