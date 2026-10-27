use anyhow::Result;
use clap::Subcommand;
use serde_json::Value;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum SpecAction {
    /// Validate a task spec file against the yana-ai spec schema
    Validate {
        file: String,
        #[arg(long)] json: bool,
    },
    /// Show the spec schema
    Schema,
    /// Compile a Markdown SOP (Standard Operating Procedure) with optional
    /// `--set KEY=VALUE` parameters into a validated Yana Spec + SKILL.md +
    /// narrowed IntentDeclaration proposal.
    CompileSop {
        file: String,
        #[arg(long = "set")]
        vars: Vec<String>,
        #[arg(long)]
        out_dir: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Build a Blind Rubric evaluation packet for a Spec — strips all agent
    /// conversation/self-report history and packages only the Spec acceptance
    /// criteria + independent git diff evidence + authority receipt summary.
    BlindRubric {
        spec: String,
        #[arg(long, default_value = "HEAD")]
        diff_base: String,
        #[arg(long, default_value = ".")]
        dir: String,
        #[arg(long)]
        json: bool,
    },
}

pub fn dispatch(action: SpecAction) {
    let result = match action {
        SpecAction::Validate { file, json } => cmd_validate(&file, json),
        SpecAction::Schema => { print_schema(); Ok(()) }
        SpecAction::CompileSop { file, vars, out_dir, json } => {
            cmd_compile_sop(&file, &vars, out_dir.as_deref(), json)
        }
        SpecAction::BlindRubric { spec, diff_base, dir, json } => {
            cmd_blind_rubric(&spec, &diff_base, &dir, json)
        }
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

#[derive(Debug)]
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

    // Authority-contract fields (optional). Absent = fine, a spec with no
    // authority hints just carries no automatic IntentDeclaration proposal.
    // Present-but-malformed = error, never silently ignored: a broken
    // authority-relevant field must not fall through as if it said nothing.
    validate_string_list_field(spec, &["commands", "allow"], "SPEC006", &mut f);
    validate_string_list_field(spec, &["network", "allow"], "SPEC007", &mut f);
    validate_string_list_field(spec, &["approval_required"], "SPEC008", &mut f);
    validate_limits_field(spec, &mut f);

    f
}

/// Validates an optional array-of-non-empty-strings field at `path`.
/// Absent is not an error (the field is optional); present-but-wrong-shape is.
fn validate_string_list_field(spec: &Value, path: &[&str], id: &str, f: &mut Vec<Finding>) {
    let mut cur = spec;
    for key in path {
        match cur.get(key) {
            Some(v) => cur = v,
            None => return,
        }
    }
    let dotted = path.join(".");
    match cur {
        Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                if v.as_str().map(|s| !s.is_empty()).unwrap_or(false) {
                    continue;
                }
                f.push(Finding {
                    id: format!("{id}-{i}"),
                    severity: "error",
                    message: format!("'{dotted}' entry {i} must be a non-empty string"),
                });
            }
        }
        _ => f.push(Finding {
            id: id.to_string(),
            severity: "error",
            message: format!("'{dotted}' must be an array of strings"),
        }),
    }
}

/// Validates the optional `limits` object. Only `max_files_changed` has a
/// known shape today; unrecognized keys are left alone rather than rejected,
/// since this is a proposal the deterministic layer may extend independently.
fn validate_limits_field(spec: &Value, f: &mut Vec<Finding>) {
    let Some(limits) = spec.get("limits") else { return };
    match limits {
        Value::Object(_) => {
            if let Some(max_files) = limits.get("max_files_changed") {
                let ok = max_files.as_u64().is_some();
                if !ok {
                    f.push(Finding {
                        id: "SPEC009-MAX_FILES".into(),
                        severity: "error",
                        message: "'limits.max_files_changed' must be a non-negative integer".into(),
                    });
                }
            }
        }
        _ => f.push(Finding {
            id: "SPEC009".into(),
            severity: "error",
            message: "'limits' must be an object".into(),
        }),
    }
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
        "notes":       "string (optional)",
        "commands": {
            "allow": ["string (optional) — commands this spec proposes as allowed"]
        },
        "network": {
            "allow": ["string (optional) — hosts this spec proposes as allowed"]
        },
        "limits": {
            "max_files_changed": "integer (optional)"
        },
        "approval_required": ["string (optional) — categories that always force human approval, e.g. dependency_change, database_migration, ci_workflow_change"]
    })).unwrap());
}

// ── Authority contract wiring (BMAD-YANA unification, Phase 5) ─────────────
//
// Pure translation from a validated spec's authority-contract fields
// (§commands/§network/§limits/§approval_required, added Phase 1) into a real
// `IntentDeclaration` (Authority Hardening item #7, `src/runtime/authority.rs`).
// This function has no authority of its own: `IntentDeclaration` can only
// ever narrow an `Allow` decision the existing four-term envelope
// (HALT/registry/lease-or-approval/policy) already produced, never grant,
// widen, or replace anything — see `authority.rs::narrow_by_intent`'s own
// doc comment. Nothing in `authority.rs` or `lease.rs` is touched by this
// module.
//
// Correction made during implementation, not assumed at design time: the
// real capability registry (`src/capability/registry_data.rs`) has no
// `network.*` capability of any kind today (repo.tree, repo.read,
// repo.search, git.status, git.diff, host.summary, process.list,
// process.inspect, command.validate, command.execute, file.write,
// config.write — that is the complete list). So `SPEC.network.allow[]` has
// nothing real to map onto yet. Silently inventing a capability name for it
// would produce a declaration that can never actually narrow anything —
// worse than not mapping it, since it would look handled while doing
// nothing. It is left unmapped here and counted in `SpecIntentReport`
// instead, so a caller can see "N network entries present, 0 translated"
// rather than the entries vanishing without a trace. The same applies to
// `approval_required[]`'s category names (`dependency_change`,
// `database_migration`, `ci_workflow_change`, ...): they are not literal
// capability names in the registry either, so there is no honest automatic
// mapping for them yet; they are reported, not translated.

/// What `to_intent_declaration` could and could not translate, so a caller
/// never has to guess whether an unmapped field was silently dropped.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct SpecIntentReport {
    pub mapped_command_entries: usize,
    pub unmapped_network_entries: usize,
    pub unmapped_approval_required_entries: usize,
}

/// Builds an `IntentDeclaration` proposal from a validated spec. Callers
/// are expected to have already run `validate_spec`/`cmd_validate`
/// successfully — this function does not re-validate shape, it trusts the
/// same optional-field conventions `validate_spec` checks.
pub(crate) fn to_intent_declaration(spec: &Value) -> (crate::runtime::IntentDeclaration, SpecIntentReport) {
    let mut declared_capabilities: Vec<String> = Vec::new();
    let mut declared_scope: Vec<String> = Vec::new();
    let mut mapped_command_entries = 0usize;

    if let Some(Value::Array(arr)) = spec.pointer("/commands/allow") {
        let entries: Vec<String> = arr.iter().filter_map(|v| v.as_str().map(String::from)).collect();
        if !entries.is_empty() {
            // "command.execute" is the one real registered capability whose
            // invocation is scoped by command text (see
            // `authority.rs::command_text_for_lease`), so it is the only
            // capability name this translation ever proposes.
            declared_capabilities.push("command.execute".to_string());
            mapped_command_entries = entries.len();
            declared_scope.extend(entries);
        }
    }

    let unmapped_network_entries = spec
        .pointer("/network/allow")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(0);

    let unmapped_approval_required_entries = spec
        .get("approval_required")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(0);

    let id = spec.get("id").and_then(|v| v.as_str()).unwrap_or("(no id)");
    let goal = spec.get("goal").and_then(|v| v.as_str()).unwrap_or("(no goal declared)");
    let declared_reason = format!("spec {id}: {goal}");

    let declaration = crate::runtime::IntentDeclaration {
        declared_capabilities,
        declared_scope,
        declared_reason,
    };
    let report = SpecIntentReport {
        mapped_command_entries,
        unmapped_network_entries,
        unmapped_approval_required_entries,
    };
    (declaration, report)
}

// ── SOP Compiler & Blind Rubric (Wave 2: Spec-Driven Authority) ──────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct CompiledSop {
    pub spec: Value,
    pub skill_markdown: String,
    pub intent_declaration: crate::runtime::IntentDeclaration,
    pub intent_report: SpecIntentReport,
}

/// Single-pass (non-recursive) substitution of `{{KEY}}` and `${KEY}` tokens
/// inside a single string value. Replacement values are emitted verbatim and
/// never rescanned, preventing second-order `VAL1={{KEY2}}` expansion.
fn substitute_placeholders_single_pass(
    input: &str,
    bindings: &std::collections::HashMap<String, String>,
) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 2 <= bytes.len() && &input[i..i + 2] == "{{" {
            if let Some(rel_end) = input[i + 2..].find("}}") {
                let key = input[i + 2..i + 2 + rel_end].trim();
                if let Some(val) = bindings.get(key) {
                    out.push_str(val);
                    i += 2 + rel_end + 2;
                    continue;
                }
            }
        } else if i + 2 <= bytes.len() && &input[i..i + 2] == "${" {
            if let Some(rel_end) = input[i + 2..].find('}') {
                let key = input[i + 2..i + 2 + rel_end].trim();
                if let Some(val) = bindings.get(key) {
                    out.push_str(val);
                    i += 2 + rel_end + 1;
                    continue;
                }
            }
        }
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn find_unresolved_placeholder_in_str(s: &str) -> Option<String> {
    if let Some(start) = s.find("{{") {
        if let Some(end) = s[start + 2..].find("}}") {
            let token = s[start + 2..start + 2 + end].trim();
            if !token.is_empty() && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
                return Some(format!("{{{{{token}}}}}"));
            }
        }
    }
    if let Some(start) = s.find("${") {
        if let Some(end) = s[start + 2..].find('}') {
            let token = s[start + 2..start + 2 + end].trim();
            if !token.is_empty() && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
                return Some(format!("${{{token}}}"));
            }
        }
    }
    None
}

fn apply_bindings_to_value(
    val: &mut Value,
    bindings: &std::collections::HashMap<String, String>,
) -> Result<()> {
    match val {
        Value::String(s) => {
            if let Some(unresolved) = find_unresolved_placeholder_in_str(s) {
                let key = unresolved
                    .trim_start_matches("{{")
                    .trim_start_matches("${")
                    .trim_end_matches("}}")
                    .trim_end_matches('}')
                    .trim();
                if !bindings.contains_key(key) {
                    anyhow::bail!("unresolved SOP placeholder '{unresolved}' (pass --set {key}=VALUE)");
                }
            }
            *s = substitute_placeholders_single_pass(s, bindings);
        }
        Value::Array(arr) => {
            for item in arr {
                apply_bindings_to_value(item, bindings)?;
            }
        }
        Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                apply_bindings_to_value(v, bindings)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn slugify_sop_id(raw: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for c in raw.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    let cleaned = slug.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "sop-generated".to_string()
    } else {
        cleaned
    }
}

fn yaml_quote_single_line(s: &str) -> String {
    let single_line: String = s
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .collect();
    serde_json::to_string(&single_line).unwrap_or_else(|_| "\"sop\"".to_string())
}

/// Pure compiler from a Markdown SOP (or JSON spec) + `KEY=VALUE` variable
/// bindings into a validated Spec JSON, a generated `SKILL.md` body, and a
/// narrowed `IntentDeclaration`.
///
/// Security invariant: JSON/Markdown structure is parsed FIRST, and `--set`
/// bindings are applied in a single non-recursive pass strictly to string leaf
/// values so a variable binding can NEVER inject JSON keys or escalate
/// `commands.allow` / `IntentDeclaration` permissions.
pub fn compile_sop_markdown(raw: &str, vars: &[String]) -> Result<CompiledSop> {
    let mut bindings = std::collections::HashMap::new();
    for kv in vars {
        let Some((k, v)) = kv.split_once('=') else {
            anyhow::bail!("invalid --set '{kv}': expected KEY=VALUE");
        };
        let key = k.trim();
        anyhow::ensure!(!key.is_empty(), "empty key in --set '{kv}'");
        bindings.insert(key.to_string(), v.to_string());
    }

    // Parse structure BEFORE variable substitution so `--set` values can never
    // inject JSON keys, arrays, or Markdown headings.
    let mut spec: Value = if raw.trim_start().starts_with('{') {
        serde_json::from_str(raw).map_err(|e| anyhow::anyhow!("Invalid SOP JSON: {e}"))?
    } else {
        parse_markdown_sop_to_spec(raw)?
    };

    let derive_id_from_h1 = spec
        .get("_derive_id_from_h1")
        .and_then(|v| v.as_str())
        .map(String::from);
    if let Some(obj) = spec.as_object_mut() {
        obj.remove("_derive_id_from_h1");
    }

    apply_bindings_to_value(&mut spec, &bindings)?;

    if let Some(h1_template) = derive_id_from_h1 {
        if find_unresolved_placeholder_in_str(&h1_template).is_some() {
            let mut h1_val = Value::String(h1_template);
            apply_bindings_to_value(&mut h1_val, &bindings)?;
            if let Some(s) = h1_val.as_str() {
                spec["id"] = Value::String(slugify_sop_id(s));
            }
        }
    }

    let findings = validate_spec(&spec);
    if findings.iter().any(|f| f.severity == "error") {
        let errs: Vec<String> = findings
            .into_iter()
            .filter(|f| f.severity == "error")
            .map(|f| format!("[{}] {}", f.id, f.message))
            .collect();
        anyhow::bail!("compiled SOP failed spec validation: {}", errs.join("; "));
    }

    let (intent_declaration, intent_report) = to_intent_declaration(&spec);
    let id = spec.get("id").and_then(|v| v.as_str()).unwrap_or("sop-skill");
    let goal = spec.get("goal").and_then(|v| v.as_str()).unwrap_or("Compiled SOP");
    let tasks = spec
        .get("tasks")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let quoted_id = yaml_quote_single_line(id);
    let quoted_goal = yaml_quote_single_line(goal);
    let clean_heading: String = id.chars().filter(|&c| c != '\n' && c != '\r').collect();
    let mut skill_md = format!(
        "---\nname: {quoted_id}\ndescription: {quoted_goal}\n---\n\n# {clean_heading}\n\n{goal}\n\n## Workflow Steps\n\n"
    );
    for (idx, t) in tasks.iter().enumerate() {
        let tid = t.get("id").and_then(|v| v.as_str()).unwrap_or("step");
        let desc = t.get("description").and_then(|v| v.as_str()).unwrap_or("");
        skill_md.push_str(&format!("{}. **[{}]** {}\n", idx + 1, tid, desc));
    }

    Ok(CompiledSop {
        spec,
        skill_markdown: skill_md,
        intent_declaration,
        intent_report,
    })
}

fn parse_markdown_sop_to_spec(md: &str) -> Result<Value> {
    let mut id = String::from("sop-generated");
    let mut raw_h1 = String::new();
    let mut goal = String::new();
    let mut tasks: Vec<Value> = Vec::new();
    let mut acceptance: Vec<String> = Vec::new();
    let mut scope: Vec<String> = Vec::new();
    let mut allow_cmds: Vec<String> = Vec::new();
    let mut section = "";

    for raw_line in md.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(h1) = line.strip_prefix("# ") {
            raw_h1 = h1.trim().to_string();
            id = slugify_sop_id(&raw_h1);
            if goal.is_empty() {
                goal = raw_h1.clone();
            }
            continue;
        }
        if let Some(h2) = line.strip_prefix("## ") {
            let lower = h2.trim().to_lowercase();
            if lower.contains("non-goal") || lower.contains("non goal") || lower.contains("out of scope") {
                section = "ignore";
            } else if matches!(
                lower.as_str(),
                "goal" | "goals" | "objective" | "objectives"
            ) {
                section = "goal";
            } else if lower.contains("step") || lower.contains("task") || lower.contains("workflow") {
                section = "tasks";
            } else if lower.contains("accept") || lower.contains("criteria") {
                section = "acceptance";
            } else if lower.contains("scope") || lower.contains("file") {
                section = "scope";
            } else if lower.contains("command") || lower.contains("allow") {
                section = "commands";
            } else {
                section = "";
            }
            continue;
        }

        let item = line
            .strip_prefix("- ")
            .or_else(|| line.strip_prefix("* "))
            .or_else(|| {
                line.find(". ")
                    .and_then(|pos| line[..pos].chars().all(|c| c.is_ascii_digit()).then(|| &line[pos + 2..]))
            });

        match section {
            "ignore" => {}
            "goal" => {
                goal = item.unwrap_or(line).trim().to_string();
            }
            "tasks" => {
                if let Some(text) = item {
                    let idx = tasks.len() + 1;
                    tasks.push(serde_json::json!({
                        "id": format!("step-{idx}"),
                        "description": text.trim(),
                    }));
                }
            }
            "acceptance" => {
                if let Some(text) = item {
                    acceptance.push(text.trim().to_string());
                }
            }
            "scope" => {
                if let Some(text) = item {
                    scope.push(text.trim().trim_matches('`').to_string());
                }
            }
            "commands" => {
                if let Some(text) = item {
                    allow_cmds.push(text.trim().trim_matches('`').to_string());
                }
            }
            _ => {
                if let Some(text) = item {
                    let idx = tasks.len() + 1;
                    tasks.push(serde_json::json!({
                        "id": format!("step-{idx}"),
                        "description": text.trim(),
                    }));
                } else if goal.is_empty() {
                    goal = line.to_string();
                }
            }
        }
    }

    if goal.is_empty() {
        goal = format!("Execute SOP {id}");
    }
    if tasks.is_empty() {
        tasks.push(serde_json::json!({
            "id": "step-1",
            "description": goal.clone(),
        }));
    }

    let mut obj = serde_json::json!({
        "id": id,
        "goal": goal,
        "tasks": tasks,
        "acceptance_criteria": acceptance,
        "scope": scope,
    });
    if !raw_h1.is_empty() {
        obj["_derive_id_from_h1"] = Value::String(raw_h1);
    }
    if !allow_cmds.is_empty() {
        obj["commands"] = serde_json::json!({ "allow": allow_cmds });
    }
    Ok(obj)
}

fn cmd_compile_sop(file: &str, vars: &[String], out_dir: Option<&str>, as_json: bool) -> Result<()> {
    let path = Path::new(file);
    anyhow::ensure!(path.exists(), "SOP file not found: {file}");
    let raw = std::fs::read_to_string(path)?;
    let compiled = compile_sop_markdown(&raw, vars)?;

    if let Some(dir) = out_dir {
        let out_path = Path::new(dir);
        std::fs::create_dir_all(out_path)?;
        std::fs::write(out_path.join("SKILL.md"), &compiled.skill_markdown)?;
        std::fs::write(
            out_path.join("spec.json"),
            serde_json::to_string_pretty(&compiled.spec)?,
        )?;
        std::fs::write(
            out_path.join("intent_declaration.json"),
            serde_json::to_string_pretty(&compiled.intent_declaration)?,
        )?;
    }

    if as_json {
        println!("{}", serde_json::to_string_pretty(&compiled)?);
    } else {
        let id = compiled.spec.get("id").and_then(|v| v.as_str()).unwrap_or("?");
        println!("✓ Compiled SOP '{id}'");
        println!(
            "  tasks: {}  mapped_commands: {}",
            compiled
                .spec
                .get("tasks")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0),
            compiled.intent_report.mapped_command_entries
        );
    }
    Ok(())
}

/// Builds a Blind Rubric packet containing only the Spec acceptance criteria,
/// independent git diff + untracked file measurements (`changed_files`), and
/// historical authority receipt counts — zero agent conversation or self-report text.
///
/// Honest scope disclosure: `deterministic_gate_passed` verifies ONLY
/// deterministic `scope` and `limits.max_files_changed` constraints against
/// `changed_files`. `acceptance_criteria` are emitted as
/// `unverified_acceptance_criteria` for an external/blind judge to evaluate.
pub fn build_blind_rubric(spec: &Value, changed_files: &[String], dir: &Path) -> Result<Value> {
    let findings = validate_spec(spec);
    if findings.iter().any(|f| f.severity == "error") {
        anyhow::bail!("Spec has validation errors; fix spec before running blind-rubric");
    }

    let declared_scope: Vec<String> = spec
        .get("scope")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let out_of_scope_files: Vec<String> = if declared_scope.is_empty() {
        Vec::new()
    } else {
        changed_files
            .iter()
            .filter(|file| {
                !declared_scope.iter().any(|allowed| {
                    file.as_str() == allowed
                        || file.starts_with(&format!("{}/", allowed.trim_end_matches('/')))
                })
            })
            .cloned()
            .collect()
    };

    let max_files_limit = spec
        .pointer("/limits/max_files_changed")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);

    let limits_compliant = max_files_limit
        .map(|max| changed_files.len() <= max)
        .unwrap_or(true);
    let scope_compliant = out_of_scope_files.is_empty();

    // Count historical authority receipts if present
    let receipts_path = dir.join(".yana-ai/authority-receipts.jsonl");
    let mut allow_receipts = 0usize;
    let mut deny_receipts = 0usize;
    if let Ok(raw) = std::fs::read_to_string(receipts_path) {
        for line in raw.lines().filter(|l| !l.trim().is_empty()) {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                match v.get("outcome").and_then(|o| o.as_str()) {
                    Some("allow") => allow_receipts += 1,
                    Some("deny") => deny_receipts += 1,
                    _ => {}
                }
            }
        }
    }

    let acceptance = spec
        .get("acceptance_criteria")
        .cloned()
        .unwrap_or(serde_json::json!([]));

    Ok(serde_json::json!({
        "rubric_mode": "blind_scope_and_diff_gate",
        "agent_self_report_included": false,
        "spec_id": spec.get("id").and_then(|v| v.as_str()).unwrap_or(""),
        "goal": spec.get("goal").and_then(|v| v.as_str()).unwrap_or(""),
        "acceptance_criteria": acceptance.clone(),
        "unverified_acceptance_criteria": acceptance,
        "tasks": spec.get("tasks").cloned().unwrap_or(serde_json::json!([])),
        "independent_evidence": {
            "changed_files_count": changed_files.len(),
            "changed_files": changed_files,
            "out_of_scope_files": out_of_scope_files,
            "max_files_changed_limit": max_files_limit,
            "scope_compliant": scope_compliant,
            "limits_compliant": limits_compliant,
            "historical_authority_receipts": {
                "allow": allow_receipts,
                "deny": deny_receipts,
            }
        },
        "deterministic_gate_passed": scope_compliant && limits_compliant,
    }))
}

/// Fail-closed git diff + untracked file collector for `blind-rubric`:
/// 1. Rejects `diff_base` starting with `-` (blocks `--output=/path` flag injection).
/// 2. Verifies `root` is a valid git working tree (`git rev-parse --is-inside-work-tree`).
/// 3. Verifies `diff_base` resolves to a valid commit (`git rev-parse --verify --end-of-options <diff_base>^{commit}`).
/// 4. Collects both tracked changes (`git diff --name-only <rev> --`) and untracked files
///    (`git ls-files --others --exclude-standard`).
pub fn collect_git_changed_files_strict(root: &Path, diff_base: &str) -> Result<Vec<String>> {
    let trimmed = diff_base.trim();
    anyhow::ensure!(
        !trimmed.is_empty(),
        "invalid --diff-base: revision must not be empty"
    );
    anyhow::ensure!(
        !trimmed.starts_with('-'),
        "invalid --diff-base '{trimmed}': revision must not start with '-'"
    );

    let inside = std::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(root)
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute git in {}: {e}", root.display()))?;
    if !inside.status.success() || String::from_utf8_lossy(&inside.stdout).trim() != "true" {
        anyhow::bail!(
            "directory '{}' is not a git repository (blind-rubric fails closed)",
            root.display()
        );
    }

    let rev_spec = format!("{trimmed}^{{commit}}");
    let verified = std::process::Command::new("git")
        .args(["rev-parse", "--verify", "--quiet", "--end-of-options", &rev_spec])
        .current_dir(root)
        .output()
        .map_err(|e| anyhow::anyhow!("failed to verify --diff-base '{trimmed}': {e}"))?;
    if !verified.status.success() {
        anyhow::bail!(
            "invalid --diff-base '{trimmed}': revision does not resolve to a commit"
        );
    }
    let commit_sha = String::from_utf8_lossy(&verified.stdout).trim().to_string();

    let diff_out = std::process::Command::new("git")
        .args(["diff", "--name-only", &commit_sha, "--"])
        .current_dir(root)
        .output()
        .map_err(|e| anyhow::anyhow!("git diff failed: {e}"))?;
    if !diff_out.status.success() {
        let stderr = String::from_utf8_lossy(&diff_out.stderr);
        anyhow::bail!("git diff failed: {}", stderr.trim());
    }

    let untracked_out = std::process::Command::new("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(root)
        .output()
        .map_err(|e| anyhow::anyhow!("git ls-files failed: {e}"))?;
    if !untracked_out.status.success() {
        let stderr = String::from_utf8_lossy(&untracked_out.stderr);
        anyhow::bail!("git ls-files failed: {}", stderr.trim());
    }

    let mut set = std::collections::BTreeSet::new();
    for line in String::from_utf8_lossy(&diff_out.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&untracked_out.stdout).lines())
    {
        let p = line.trim();
        if !p.is_empty() {
            set.insert(p.to_string());
        }
    }
    Ok(set.into_iter().collect())
}

fn cmd_blind_rubric(spec_file: &str, diff_base: &str, dir: &str, as_json: bool) -> Result<()> {
    let spec_path = Path::new(spec_file);
    anyhow::ensure!(spec_path.exists(), "Spec file not found: {spec_file}");
    let spec: Value = serde_json::from_str(&std::fs::read_to_string(spec_path)?)?;

    let root = Path::new(dir);
    let changed_files = collect_git_changed_files_strict(root, diff_base)?;

    let packet = build_blind_rubric(&spec, &changed_files, root)?;
    if as_json {
        println!("{}", serde_json::to_string_pretty(&packet)?);
    } else {
        println!(
            "Blind Rubric [{}]: gate_passed={} (changed={}, out_of_scope={})",
            packet["spec_id"].as_str().unwrap_or("?"),
            packet["deterministic_gate_passed"],
            changed_files.len(),
            packet["independent_evidence"]["out_of_scope_files"]
                .as_array()
                .map(|a| a.len())
                .unwrap_or(0)
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_spec() -> serde_json::Value {
        serde_json::json!({
            "id": "AUTH-042",
            "goal": "example",
            "tasks": [{ "id": "t1", "description": "do the thing" }]
        })
    }

    fn has_error(findings: &[Finding], id_prefix: &str) -> bool {
        findings.iter().any(|f| f.severity == "error" && f.id.starts_with(id_prefix))
    }

    #[test]
    fn minimal_spec_is_valid_with_only_recommended_warnings() {
        let spec = base_spec();
        let findings = validate_spec(&spec);
        assert!(findings.iter().all(|f| f.severity != "error"), "unexpected errors: {findings:?}");
    }

    #[test]
    fn pre_phase1_spec_without_new_fields_still_validates() {
        // Regression: a spec written before the authority-contract fields
        // existed must remain valid, since those fields are optional.
        let spec = base_spec();
        assert!(spec.get("commands").is_none());
        assert!(spec.get("network").is_none());
        assert!(spec.get("limits").is_none());
        assert!(spec.get("approval_required").is_none());
        let findings = validate_spec(&spec);
        assert!(!has_error(&findings, "SPEC006"));
        assert!(!has_error(&findings, "SPEC007"));
        assert!(!has_error(&findings, "SPEC008"));
        assert!(!has_error(&findings, "SPEC009"));
    }

    #[test]
    fn valid_authority_fields_produce_no_new_errors() {
        let mut spec = base_spec();
        spec["commands"] = serde_json::json!({ "allow": ["pytest", "cargo test"] });
        spec["network"] = serde_json::json!({ "allow": ["accounts.google.com"] });
        spec["limits"] = serde_json::json!({ "max_files_changed": 15 });
        spec["approval_required"] = serde_json::json!(["dependency_change", "database_migration"]);
        let findings = validate_spec(&spec);
        assert!(findings.iter().all(|f| f.severity != "error"), "unexpected errors: {findings:?}");
    }

    #[test]
    fn malformed_commands_allow_is_an_error_not_silently_dropped() {
        let mut spec = base_spec();
        spec["commands"] = serde_json::json!({ "allow": "pytest" }); // string, not array
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC006"));
    }

    #[test]
    fn commands_allow_entry_must_be_non_empty_string() {
        let mut spec = base_spec();
        spec["commands"] = serde_json::json!({ "allow": ["pytest", "", 42] });
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC006"));
    }

    #[test]
    fn approval_required_malformed_is_an_error() {
        let mut spec = base_spec();
        spec["approval_required"] = serde_json::json!("dependency_change"); // string, not array
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC008"));
    }

    #[test]
    fn approval_required_well_formed_is_accepted() {
        let mut spec = base_spec();
        spec["approval_required"] = serde_json::json!(["ci_workflow_change"]);
        let findings = validate_spec(&spec);
        assert!(!has_error(&findings, "SPEC008"));
    }

    #[test]
    fn limits_must_be_an_object() {
        let mut spec = base_spec();
        spec["limits"] = serde_json::json!(15);
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC009"));
    }

    #[test]
    fn limits_max_files_changed_must_be_non_negative_integer() {
        let mut spec = base_spec();
        spec["limits"] = serde_json::json!({ "max_files_changed": -1 });
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC009-MAX_FILES"));

        let mut spec2 = base_spec();
        spec2["limits"] = serde_json::json!({ "max_files_changed": "fifteen" });
        let findings2 = validate_spec(&spec2);
        assert!(has_error(&findings2, "SPEC009-MAX_FILES"));
    }

    #[test]
    fn limits_unknown_keys_are_left_alone() {
        let mut spec = base_spec();
        spec["limits"] = serde_json::json!({ "max_files_changed": 5, "some_future_key": true });
        let findings = validate_spec(&spec);
        assert!(!has_error(&findings, "SPEC009"));
    }

    #[test]
    fn network_allow_follows_same_rule_as_commands_allow() {
        let mut spec = base_spec();
        spec["network"] = serde_json::json!({ "allow": [1, 2] });
        let findings = validate_spec(&spec);
        assert!(has_error(&findings, "SPEC007"));
    }

    // ── to_intent_declaration — Phase 5, SPEC -> IntentDeclaration ──────────

    #[test]
    fn spec_with_no_authority_fields_declares_nothing() {
        let spec = base_spec();
        let (decl, report) = to_intent_declaration(&spec);
        assert!(decl.declared_capabilities.is_empty());
        assert!(decl.declared_scope.is_empty());
        assert_eq!(report.mapped_command_entries, 0);
        assert_eq!(report.unmapped_network_entries, 0);
        assert_eq!(report.unmapped_approval_required_entries, 0);
    }

    #[test]
    fn commands_allow_maps_to_command_execute_capability() {
        let mut spec = base_spec();
        spec["commands"] = serde_json::json!({ "allow": ["pytest", "cargo test"] });
        let (decl, report) = to_intent_declaration(&spec);
        assert_eq!(decl.declared_capabilities, vec!["command.execute".to_string()]);
        assert_eq!(decl.declared_scope, vec!["pytest".to_string(), "cargo test".to_string()]);
        assert_eq!(report.mapped_command_entries, 2);
    }

    #[test]
    fn network_allow_is_reported_not_silently_dropped() {
        // No real "network.*" capability exists in the registry today
        // (src/capability/registry_data.rs) — this must show up as an
        // unmapped count, never vanish without a trace.
        let mut spec = base_spec();
        spec["network"] = serde_json::json!({ "allow": ["accounts.google.com"] });
        let (decl, report) = to_intent_declaration(&spec);
        assert!(decl.declared_capabilities.is_empty());
        assert_eq!(report.unmapped_network_entries, 1);
    }

    #[test]
    fn approval_required_is_reported_not_silently_dropped() {
        let mut spec = base_spec();
        spec["approval_required"] = serde_json::json!(["dependency_change", "database_migration"]);
        let (_decl, report) = to_intent_declaration(&spec);
        assert_eq!(report.unmapped_approval_required_entries, 2);
    }

    #[test]
    fn declared_reason_carries_id_and_goal_for_audit() {
        let spec = base_spec();
        let (decl, _report) = to_intent_declaration(&spec);
        assert!(decl.declared_reason.contains("AUTH-042"));
        assert!(decl.declared_reason.contains("example"));
    }

    #[test]
    fn full_authority_contract_spec_translates_end_to_end() {
        let mut spec = base_spec();
        spec["commands"] = serde_json::json!({ "allow": ["pytest", "cargo test"] });
        spec["network"] = serde_json::json!({ "allow": ["accounts.google.com"] });
        spec["limits"] = serde_json::json!({ "max_files_changed": 15 });
        spec["approval_required"] = serde_json::json!(["dependency_change", "database_migration"]);
        assert!(validate_spec(&spec).iter().all(|f| f.severity != "error"));

        let (decl, report) = to_intent_declaration(&spec);
        assert_eq!(decl.declared_capabilities, vec!["command.execute".to_string()]);
        assert_eq!(report.mapped_command_entries, 2);
        assert_eq!(report.unmapped_network_entries, 1);
        assert_eq!(report.unmapped_approval_required_entries, 2);
    }

    #[test]
    fn compile_sop_markdown_substitutes_variables_and_builds_intent() {
        let md = "# Release {{SERVICE}}\n\n## Goal\nShip {{SERVICE}} safely\n\n## Steps\n- Run tests for ${SERVICE}\n- Verify metrics\n\n## Scope\n- `src/`\n\n## Allowed Commands\n- `cargo test`\n";
        let compiled = compile_sop_markdown(md, &["SERVICE=billing".to_string()]).unwrap();
        assert_eq!(compiled.spec["id"], "release-billing");
        assert_eq!(compiled.spec["goal"], "Ship billing safely");
        assert!(compiled.skill_markdown.contains("Run tests for billing"));
        assert_eq!(
            compiled.intent_declaration.declared_capabilities,
            vec!["command.execute".to_string()]
        );
        assert_eq!(
            compiled.intent_declaration.declared_scope,
            vec!["cargo test".to_string()]
        );
    }

    #[test]
    fn build_blind_rubric_enforces_scope_and_max_files_without_self_report() {
        let mut spec = base_spec();
        spec["scope"] = serde_json::json!(["src/"]);
        spec["limits"] = serde_json::json!({ "max_files_changed": 2 });

        let ok_packet = build_blind_rubric(
            &spec,
            &["src/main.rs".to_string(), "src/lib.rs".to_string()],
            Path::new("."),
        )
        .unwrap();
        assert_eq!(ok_packet["agent_self_report_included"], false);
        assert_eq!(ok_packet["deterministic_gate_passed"], true);

        let out_of_scope = build_blind_rubric(
            &spec,
            &["src/main.rs".to_string(), "app/secret.ts".to_string()],
            Path::new("."),
        )
        .unwrap();
        assert_eq!(out_of_scope["deterministic_gate_passed"], false);
        assert_eq!(
            out_of_scope["independent_evidence"]["out_of_scope_files"],
            serde_json::json!(["app/secret.ts"])
        );
    }

    #[test]
    fn compile_sop_blocks_json_injection_and_recursive_expansion() {
        let json_sop = r#"{
            "id": "sop-safe",
            "goal": "Deploy {{SERVICE}} with {{NOTE}}",
            "tasks": [{ "id": "t1", "description": "deploy {{SERVICE}}" }]
        }"#;
        // Attempted JSON injection via --set value (Claude Code audit 2B)
        let malicious = r#"x","commands":{"allow":["echo INJECTED"]},"zz":"#;
        let compiled = compile_sop_markdown(
            json_sop,
            &[
                format!("SERVICE={malicious}"),
                "NOTE={{SERVICE}}".to_string(),
            ],
        )
        .unwrap();
        assert!(compiled.intent_declaration.declared_capabilities.is_empty());
        assert!(compiled.intent_declaration.declared_scope.is_empty());
        // Single-pass: NOTE={{SERVICE}} becomes literal "{{SERVICE}}", not expanded recursively
        assert!(compiled.spec["goal"]
            .as_str()
            .unwrap()
            .ends_with("with {{SERVICE}}"));
    }

    #[test]
    fn compile_sop_rejects_unresolved_placeholders_and_ignores_non_goals() {
        let md = "# Ship App\n\n## Goal\nShip {{TARGET}}\n\n## Non-goals\n- Do not rewrite billing\n\n## Steps\n- Build binary\n";
        let err = compile_sop_markdown(md, &[]).unwrap_err();
        assert!(err.to_string().contains("{{TARGET}}"));

        let ok = compile_sop_markdown(md, &["TARGET=v2".to_string()]).unwrap();
        assert_eq!(ok.spec["goal"], "Ship v2");
    }

    #[test]
    fn blind_rubric_git_collector_fails_closed_and_includes_untracked() {
        let tmp = std::env::temp_dir().join(format!("yana-rubric-audit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        // 1. Non-git directory -> Err (fail-closed)
        assert!(collect_git_changed_files_strict(&tmp, "HEAD").is_err());

        // Initialize git repo with 1 commit
        std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&tmp)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.email", "test@yana.local"])
            .current_dir(&tmp)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&tmp)
            .status()
            .unwrap();
        std::fs::create_dir_all(tmp.join("src")).unwrap();
        std::fs::write(tmp.join("src/lib.rs"), "pub fn a() {}\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&tmp)
            .status()
            .unwrap();
        std::process::Command::new("git")
            .args(["commit", "-m", "init", "--quiet"])
            .current_dir(&tmp)
            .status()
            .unwrap();

        // 2. Non-existent revision -> Err
        assert!(collect_git_changed_files_strict(&tmp, "DOESNOTEXIST").is_err());

        // 3. Option injection starting with '-' -> Err (and does not create injected file)
        let injected = tmp.join("INJECTED.txt");
        let flag = format!("--output={}", injected.display());
        assert!(collect_git_changed_files_strict(&tmp, &flag).is_err());
        assert!(!injected.exists());

        // 4. Untracked file outside scope is detected and fails blind-rubric gate
        std::fs::create_dir_all(tmp.join("app")).unwrap();
        std::fs::write(tmp.join("app/untracked.ts"), "export const x = 1;\n").unwrap();
        let changed = collect_git_changed_files_strict(&tmp, "HEAD").unwrap();
        assert!(changed.contains(&"app/untracked.ts".to_string()));

        let mut spec = base_spec();
        spec["scope"] = serde_json::json!(["src/"]);
        let rubric = build_blind_rubric(&spec, &changed, &tmp).unwrap();
        assert_eq!(rubric["deterministic_gate_passed"], false);

        std::fs::remove_dir_all(&tmp).ok();
    }
}
