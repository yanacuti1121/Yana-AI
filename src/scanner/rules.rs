use std::fs;
use glob::glob;

#[derive(Debug, Clone)]
pub struct RuleSet {
    pub scope:               String,
    pub file_patterns:       Vec<String>,
    /// Patterns only scanned with `--include-skills` — see file_patterns_extra
    /// in scanner/*.yml for the evidence behind each one (high false-positive
    /// rate from skill-library docs/demo scripts, not production code).
    pub file_patterns_extra: Vec<String>,
    pub exclude_patterns:    Vec<String>,
    pub checks:              Vec<serde_json::Value>,
    pub source_file:         String,
}

fn yaml_to_json(val: serde_yml::Value) -> serde_json::Value {
    match val {
        serde_yml::Value::Null             => serde_json::Value::Null,
        serde_yml::Value::Bool(b)          => serde_json::Value::Bool(b),
        serde_yml::Value::Number(n) => {
            if let Some(i) = n.as_i64() { serde_json::json!(i) }
            else { serde_json::json!(n.as_f64()) }
        }
        serde_yml::Value::String(s)        => serde_json::Value::String(s),
        serde_yml::Value::Sequence(seq)    => serde_json::Value::Array(seq.into_iter().map(yaml_to_json).collect()),
        serde_yml::Value::Mapping(map)     => {
            let mut obj = serde_json::Map::new();
            for (k, v) in map {
                obj.insert(k, yaml_to_json(v));
            }
            serde_json::Value::Object(obj)
        }
        serde_yml::Value::Tagged(t)        => yaml_to_json(t.value().clone()),
    }
}

fn ruleset_from_json(data: serde_json::Value, source_file: String) -> Option<RuleSet> {
    let obj = data.as_object()?;
    let scope = obj.get("scope")?.as_str()?.to_string();
    let checks = obj.get("checks")?.as_array()?.clone();

    let file_patterns = obj.get("file_patterns")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let file_patterns_extra = obj.get("file_patterns_extra")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let exclude_patterns = obj.get("exclude_patterns")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Some(RuleSet { scope, file_patterns, file_patterns_extra, exclude_patterns, checks, source_file })
}

pub fn load_scanner_rules(scanner_dir: &str) -> Vec<RuleSet> {
    let mut rule_sets = Vec::new();

    // Try YAML first
    let yaml_pat = format!("{scanner_dir}/*.yml");
    let mut yaml_files: Vec<_> = glob(&yaml_pat).ok()
        .map(|paths| paths.filter_map(|p| p.ok()).collect())
        .unwrap_or_default();
    yaml_files.sort();

    for path in &yaml_files {
        let content = match fs::read_to_string(path) {
            Ok(c) => c, Err(_) => continue,
        };
        let yaml_val: serde_yml::Value = match serde_yml::from_str(&content) {
            Ok(v) => v, Err(e) => {
                eprintln!("[warn] Could not parse {}: {e}", path.display()); continue;
            }
        };
        let json_val = yaml_to_json(yaml_val);
        if let Some(rs) = ruleset_from_json(json_val, path.display().to_string()) {
            rule_sets.push(rs);
        }
    }
    if !rule_sets.is_empty() { return rule_sets; }

    // Fallback: compiled JSON
    let json_pat = format!("{scanner_dir}/compiled/*.json");
    let mut json_files: Vec<_> = glob(&json_pat).ok()
        .map(|paths| paths.filter_map(|p| p.ok()).collect())
        .unwrap_or_default();
    json_files.sort();

    if !json_files.is_empty() {
        eprintln!("[info] Using scanner/compiled JSON fallback.");
    }
    for path in &json_files {
        let content = match fs::read_to_string(path) {
            Ok(c) => c, Err(_) => continue,
        };
        let data: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v, Err(e) => {
                eprintln!("[warn] Could not parse {}: {e}", path.display()); continue;
            }
        };
        if let Some(rs) = ruleset_from_json(data, path.display().to_string()) {
            rule_sets.push(rs);
        }
    }
    rule_sets
}
