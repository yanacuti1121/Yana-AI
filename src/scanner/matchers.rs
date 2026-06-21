use regex::{Regex, RegexBuilder};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug)]
pub struct Match {
    pub line:          Option<u32>,
    pub matched_value: String,
}

fn get_str<'a>(v: &'a serde_json::Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn regex_cache() -> &'static Mutex<HashMap<String, Regex>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Regex>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Compile `pattern` once per (pattern, case_insensitive, multi_line)
/// combination and reuse it afterward. `run_check` is invoked once per
/// (file, check) pair — on this repo that's thousands of files times ~69
/// checks — so without a cache, the same handful of distinct patterns were
/// being recompiled on every single one of those calls. `Regex` clones are
/// cheap (internally Arc-based), so caching by value is fine.
fn cached_regex(pattern: &str, case_insensitive: bool, multi_line: bool) -> Option<Regex> {
    let key = format!(
        "{}{}\u{0}{pattern}",
        if case_insensitive { "i" } else { "" },
        if multi_line { "m" } else { "" },
    );
    if let Some(re) = regex_cache().lock().unwrap().get(&key) {
        return Some(re.clone());
    }
    let re = RegexBuilder::new(pattern)
        .case_insensitive(case_insensitive)
        .multi_line(multi_line)
        .build()
        .ok()?;
    regex_cache().lock().unwrap().insert(key, re.clone());
    Some(re)
}

// ── Regex match engine ────────────────────────────────────────────────────────

pub fn run_regex_match(content: &str, check: &serde_json::Value) -> Vec<Match> {
    // Support both nested match block and flat check
    let m = check.get("match").filter(|v| v.is_object()).unwrap_or(check);
    let pattern      = get_str(m, "pattern");
    let flags_str    = get_str(m, "flags");
    let condition    = get_str(m, "condition");
    let skip_comments = m.get("skip_comment_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let window       = m.get("lines").and_then(|v| v.as_u64()).unwrap_or(20) as usize;

    if pattern.is_empty() { return vec![]; }

    let re = match cached_regex(pattern, flags_str.contains('i'), flags_str.contains('m')) {
        Some(r) => r, None => return vec![],
    };

    // Resolve companion pattern
    let companion_raw = get_str(m, "accompanied_by_pattern")
        .to_string()
        .or_if_empty(get_str(m, "not_accompanied_by_pattern"))
        .or_if_empty(get_str(m, "not_followed_by_pattern"))
        .or_if_empty(get_str(m, "not_preceded_by_pattern"))
        .or_if_empty(get_str(m, "not_accompanied_by"))
        .or_if_empty(get_str(check, "not_accompanied_by"));

    let companion_re: Option<Regex> = if !companion_raw.is_empty() {
        cached_regex(&companion_raw, flags_str.contains('i'), false)
    } else { None };

    let lines_vec: Vec<&str> = content.lines().collect();
    let total = lines_vec.len();
    let mut hits = Vec::new();

    for (i, line) in lines_vec.iter().enumerate() {
        let stripped = line.trim_start();
        if skip_comments && stripped.starts_with('#') { continue; }

        let m_hit = re.find(line);
        if m_hit.is_none() { continue; }
        let matched_val: String = m_hit.unwrap().as_str().chars().take(200).collect();
        let lineno = (i + 1) as u32;

        if condition.is_empty() {
            hits.push(Match { line: Some(lineno), matched_value: matched_val });
            continue;
        }

        let companion = match &companion_re {
            Some(r) => r,
            None => {
                hits.push(Match { line: Some(lineno), matched_value: matched_val });
                continue;
            }
        };

        match condition {
            "accompanied_by" => {
                let start = i.saturating_sub(window);
                let end   = (i + window + 1).min(total);
                let window_text = lines_vec[start..end].join("\n");
                if companion.is_match(&window_text) {
                    hits.push(Match { line: Some(lineno), matched_value: matched_val });
                }
            }
            "not_accompanied_by" => {
                let start = i.saturating_sub(window);
                let end   = (i + window + 1).min(total);
                let window_text = lines_vec[start..end].join("\n");
                if !companion.is_match(&window_text) {
                    hits.push(Match { line: Some(lineno), matched_value: matched_val });
                }
            }
            "not_followed_by" => {
                let end = (i + 1 + window).min(total);
                let after = lines_vec[i + 1..end].join("\n");
                if !companion.is_match(&after) {
                    hits.push(Match { line: Some(lineno), matched_value: matched_val });
                }
            }
            "not_preceded_by" => {
                let start = i.saturating_sub(window);
                let before = lines_vec[start..i].join("\n");
                if !companion.is_match(&before) {
                    hits.push(Match { line: Some(lineno), matched_value: matched_val });
                }
            }
            _ => {
                hits.push(Match { line: Some(lineno), matched_value: matched_val });
            }
        }
    }
    hits
}

// ── JSON path resolver ────────────────────────────────────────────────────────

fn resolve_json_path<'a>(obj: &'a serde_json::Value, path: &str) -> Vec<&'a serde_json::Value> {
    let parts: Vec<&str> = path.trim_start_matches('$').trim_start_matches('.').split('.').collect();
    let mut results: Vec<&serde_json::Value> = vec![obj];

    for part in parts {
        if part.is_empty() { continue; }
        let array_wildcard = part.ends_with("[*]");
        let dict_wildcard  = part == "*";
        let key = if array_wildcard { &part[..part.len() - 3] } else { part };

        let mut next = Vec::new();
        for node in &results {
            if dict_wildcard {
                match node {
                    serde_json::Value::Object(m) => next.extend(m.values()),
                    serde_json::Value::Array(a)  => next.extend(a.iter()),
                    _ => {}
                }
            } else if let Some(val) = node.get(key) {
                if array_wildcard {
                    if let serde_json::Value::Array(a) = val { next.extend(a.iter()); }
                    else { next.push(val); }
                } else {
                    next.push(val);
                }
            } else if let serde_json::Value::Array(a) = node {
                for item in a {
                    if let Some(val) = item.get(key) {
                        if array_wildcard {
                            if let serde_json::Value::Array(aa) = val { next.extend(aa.iter()); }
                            else { next.push(val); }
                        } else {
                            next.push(val);
                        }
                    }
                }
            }
        }
        results = next;
    }
    results
}

// ── JSON match engine ─────────────────────────────────────────────────────────

pub fn run_json_match(content: &str, check: &serde_json::Value) -> Vec<Match> {
    let obj: serde_json::Value = match serde_json::from_str(content) {
        Ok(v) => v, Err(_) => return vec![],
    };

    let m = check.get("match").filter(|v| v.is_object()).unwrap_or(check);
    let path      = get_str(m, "path");
    let condition = get_str(m, "condition");
    let pattern   = get_str(m, "pattern");
    let exp_val   = m.get("value");
    let req_key   = get_str(m, "key");
    let allowlist: Vec<&str> = m.get("allowlist")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    match condition {
        "missing" => {
            let vals = resolve_json_path(&obj, path);
            if vals.is_empty() {
                return vec![Match { line: None, matched_value: format!("{path} not present") }];
            }
            vec![]
        }
        "missing_key" => {
            resolve_json_path(&obj, path).into_iter()
                .filter_map(|v| v.as_object())
                .filter(|o| {
                    if !pattern.is_empty() {
                        let s = serde_json::to_string(&serde_json::Value::Object((*o).clone())).unwrap_or_default();
                        cached_regex(pattern, false, false).map(|r| r.is_match(&s)).unwrap_or(false)
                    } else { true }
                })
                .filter(|o| !req_key.is_empty() && !o.contains_key(req_key))
                .map(|_| Match { line: None, matched_value: format!("missing key '{req_key}'") })
                .collect()
        }
        c if c.starts_with("array_length_gt_") => {
            let threshold: usize = c.split('_').last().and_then(|s| s.parse().ok()).unwrap_or(0);
            let vals = resolve_json_path(&obj, path);
            if let Some(serde_json::Value::Array(a)) = vals.first() {
                if a.len() > threshold {
                    return vec![Match { line: None, matched_value: format!("array length {}", a.len()) }];
                }
            }
            vec![]
        }
        _ => {
            let vals = resolve_json_path(&obj, path);
            if let Some(expected) = exp_val {
                return vals.into_iter()
                    .filter(|v| *v == expected)
                    .map(|v| Match { line: None, matched_value: v.to_string().chars().take(200).collect() })
                    .collect();
            }
            if !pattern.is_empty() {
                let re = match cached_regex(pattern, false, false) { Some(r) => r, None => return vec![] };
                return vals.into_iter()
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .filter(|sv| {
                        re.is_match(sv) && !allowlist.iter().any(|a| {
                            sv == a || cached_regex(&a.replace('*', ".*"), false, false).map(|r| r.is_match(sv)).unwrap_or(false)
                        })
                    })
                    .map(|sv| Match { line: None, matched_value: sv.chars().take(200).collect() })
                    .collect();
            }
            vec![]
        }
    }
}

// ── Helper trait ──────────────────────────────────────────────────────────────

trait OrIfEmpty {
    fn or_if_empty(self, fallback: &str) -> String;
}
impl OrIfEmpty for String {
    fn or_if_empty(self, fallback: &str) -> String {
        if self.is_empty() { fallback.to_string() } else { self }
    }
}
impl OrIfEmpty for &str {
    fn or_if_empty(self, fallback: &str) -> String {
        if self.is_empty() { fallback.to_string() } else { self.to_string() }
    }
}
