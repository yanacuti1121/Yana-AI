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
}
