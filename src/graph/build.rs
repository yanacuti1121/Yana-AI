use crate::graph::imports::extract_imports;
use crate::graph::types::*;
use anyhow::Result;
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use walkdir::WalkDir;

pub fn build_graph(target: &str, quiet: bool) -> Result<GraphData> {
    let root = std::fs::canonicalize(target)
        .unwrap_or_else(|_| Path::new(target).to_path_buf());
    let root_str = root.to_string_lossy().to_string();

    if !quiet { eprintln!("[graph] scanning {}…", root.display()); }

    // Stage 1 — discover files
    let files = discover_files(&root_str);
    if !quiet { eprintln!("[graph] {} files found", files.len()); }

    // Stage 2 — build nodes + import edges
    let (nodes, edges) = analyze_files(&root_str, &files, quiet);

    // Stage 3 — tour (dependency-ordered top files)
    let tour = build_tour(&nodes, &edges);

    // Collect metadata
    let mut langs: HashSet<String> = HashSet::new();
    let mut frameworks: HashSet<String> = HashSet::new();
    for n in &nodes {
        if n.language != "Other" { langs.insert(n.language.clone()); }
    }
    detect_frameworks(&root_str, &mut frameworks);

    let project = root.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut lang_list: Vec<_> = langs.into_iter().collect();
    lang_list.sort();

    let data = GraphData {
        meta: GraphMeta {
            project,
            root: root_str,
            languages: lang_list,
            frameworks: frameworks.into_iter().collect(),
            total_files: files.len(),
            analysed_at: Utc::now().to_rfc3339(),
            schema_version: SCHEMA_VERSION.to_string(),
        },
        nodes,
        edges,
        tour,
    };

    // Write to disk
    let graph_dir = Path::new(target).join(GRAPH_DIR);
    std::fs::create_dir_all(&graph_dir)?;
    let out = graph_dir.join(GRAPH_FILE);
    std::fs::write(&out, serde_json::to_string_pretty(&data)?)?;

    if !quiet { eprintln!("[graph] written → {}", out.display()); }
    Ok(data)
}

fn discover_files(root: &str) -> Vec<(String, String)> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() { continue; }

        // Skip ignored dirs
        if path.components().any(|c| {
            IGNORE_DIRS.contains(&c.as_os_str().to_string_lossy().as_ref())
        }) { continue; }

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let ext_dot = format!(".{ext}");
        if IGNORE_EXTS.contains(&ext_dot.as_str()) { continue; }

        let rel = path.strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let lang = lang_from_ext(ext).to_string();
        files.push((rel, lang));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

fn analyze_files(root: &str, files: &[(String, String)], quiet: bool) -> (Vec<Node>, Vec<Edge>) {
    let mut nodes: Vec<Node> = Vec::new();
    let mut edges: Vec<Edge> = Vec::new();
    let mut file_id_map: HashMap<String, String> = HashMap::new();

    // First pass: create file nodes
    for (rel_path, lang) in files {
        let id = format!("file:{}", rel_path);
        let name = Path::new(rel_path)
            .file_name().and_then(|s| s.to_str())
            .unwrap_or(rel_path).to_string();
        let category = category_from_path(rel_path, lang);
        let layer = layer_from_path(rel_path);

        nodes.push(Node {
            id: id.clone(),
            node_type: "file".to_string(),
            name: name.clone(),
            file_path: rel_path.clone(),
            language: lang.clone(),
            summary: String::new(),
            complexity: "low".to_string(),
            tags: tags_for_file(rel_path, lang, category),
            line_range: None,
            category: category.to_string(),
        });
        file_id_map.insert(rel_path.clone(), id);
        let _ = layer; // used in tour
    }

    // Second pass: extract imports → edges
    let total = files.len();
    let log_every = (total / 10).max(1);
    for (i, (rel_path, lang)) in files.iter().enumerate() {
        if !quiet && i % log_every == 0 {
            eprint!("\r[graph] analyzing {}/{}", i + 1, total);
        }
        let full = format!("{}/{}", root, rel_path);
        let content = match std::fs::read_to_string(&full) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let imports = extract_imports(&content, lang);
        let from_id = format!("file:{}", rel_path);

        for imp in &imports {
            // Try to resolve import to a known file
            if let Some(to_id) = resolve_import(imp, rel_path, &file_id_map) {
                if to_id != from_id {
                    edges.push(Edge {
                        source: from_id.clone(),
                        target: to_id,
                        edge_type: "imports".to_string(),
                        weight: 1.0,
                    });
                }
            }
        }

        // Estimate complexity from line count
        let lines = content.lines().count();
        if let Some(n) = nodes.iter_mut().find(|n| n.id == from_id) {
            n.complexity = if lines > 300 { "high" }
                else if lines > 100 { "moderate" }
                else { "low" }.to_string();
        }
    }
    if !quiet { eprintln!("\r[graph] analyzed {} files", total); }

    edges.dedup_by(|a, b| a.source == b.source && a.target == b.target);
    (nodes, edges)
}

/// Whether `needle` appears in `haystack` aligned to `/`-separated path
/// segment boundaries on both sides (start/end of string count as
/// boundaries too). Subsumes what the old code split across two checks —
/// `k.contains(imp)` (any position, no anchoring at all) and
/// `k.ends_with(&format!("{}.rs", imp))` (anchored on the right only, and
/// itself not left-boundary-safe: `imp = "od"` would match `"src/mod.rs"`
/// via the literal suffix `"od.rs"`). Both were the same underlying bug:
/// an import name that happens to be a substring of an unrelated path
/// resolved to the wrong file — e.g. `imp = "auth"` matching inside
/// `"oauth/client.rs"`, non-deterministically depending on `HashMap`
/// iteration order when multiple unrelated paths collided this way. Wave 0
/// audit finding (`docs/PLATFORM-READINESS-WAVE0.md`, mục 2).
fn path_segment_match(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let mut start = 0;
    while let Some(rel) = haystack[start..].find(needle) {
        let abs = start + rel;
        let end = abs + needle.len();
        let before_ok = abs == 0 || haystack.as_bytes()[abs - 1] == b'/';
        let after_ok = end == haystack.len() || haystack.as_bytes()[end] == b'/';
        if before_ok && after_ok {
            return true;
        }
        start = abs + 1; // keep scanning — an earlier unaligned occurrence shouldn't hide a later aligned one
    }
    false
}

fn resolve_import(imp: &str, from_file: &str, id_map: &HashMap<String, String>) -> Option<String> {
    // Relative import: ./foo, ../bar
    if imp.starts_with("./") || imp.starts_with("../") {
        let base = Path::new(from_file).parent().unwrap_or(Path::new(""));
        let resolved = base.join(imp);
        let clean = resolved.to_string_lossy();
        // Try with extensions
        for ext in &["rs", "ts", "tsx", "js", "py", "go"] {
            let candidate = format!("{}.{}", clean, ext);
            if id_map.contains_key(&candidate) {
                return id_map.get(&candidate).cloned();
            }
        }
        if id_map.contains_key(clean.as_ref()) {
            return id_map.get(clean.as_ref()).cloned();
        }
    }
    // Internal module path (e.g., "crate/vault/mod") — match against the
    // path with its extension stripped, aligned to segment boundaries.
    for (k, v) in id_map {
        let stem = k.rsplit_once('.').map(|(s, _)| s).unwrap_or(k.as_str());
        if path_segment_match(stem, imp) {
            return Some(v.clone());
        }
    }
    None
}

#[cfg(test)]
mod resolve_import_tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn does_not_false_match_substring_inside_unrelated_path() {
        // The exact false-positive Wave 0 named: "auth" must not resolve
        // into "oauth/client.rs" just because it's a substring.
        let id_map = map(&[("src/oauth/client.rs", "file:src/oauth/client.rs")]);
        assert_eq!(resolve_import("auth", "src/main.rs", &id_map), None);
    }

    #[test]
    fn resolves_genuine_segment_aligned_module_path() {
        let id_map = map(&[("src/vault/mod.rs", "file:src/vault/mod.rs")]);
        assert_eq!(
            resolve_import("vault/mod", "src/main.rs", &id_map),
            Some("file:src/vault/mod.rs".to_string())
        );
    }

    #[test]
    fn resolves_when_needle_is_a_suffix_segment() {
        let id_map = map(&[("core/guard/lock.rs", "file:core/guard/lock.rs")]);
        assert_eq!(
            resolve_import("guard/lock", "src/main.rs", &id_map),
            Some("file:core/guard/lock.rs".to_string())
        );
    }

    #[test]
    fn does_not_false_match_suffix_that_is_not_segment_aligned() {
        // Old `k.ends_with(&format!("{}.rs", imp))` branch would have
        // matched "od" against "src/mod.rs" via the literal suffix
        // "od.rs" — not a real module named "od".
        let id_map = map(&[("src/mod.rs", "file:src/mod.rs")]);
        assert_eq!(resolve_import("od", "src/main.rs", &id_map), None);
    }

    // NOTE: a relative-import resolution test ("./foo" resolving against
    // "src/bar.rs") was deliberately NOT added here. Path::new("src").
    // join("./foo") produces "src/./foo" (Rust's Path::join does not
    // normalize "." components), which then never matches a clean map key
    // like "src/foo.rs" — relative imports (./foo, ../bar) appear to be
    // broken today for reasons entirely unrelated to this fix (the
    // relative-import branch returns before ever reaching the code this
    // file's fix touches). Out of scope for the Wave 0 finding this fix
    // addresses (docs/PLATFORM-READINESS-WAVE0.md, mục 2, specifically
    // about k.contains(imp)) — flagged separately, not fixed here.
}

fn build_tour(nodes: &[Node], edges: &[Edge]) -> Vec<TourStep> {
    // Count how many files import each node (in-degree)
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    for e in edges {
        *in_degree.entry(e.target.as_str()).or_default() += 1;
    }

    // Prioritize: docs/config first, then high in-degree, then by path
    let mut sorted: Vec<&Node> = nodes.iter()
        .filter(|n| n.node_type == "file")
        .collect();
    sorted.sort_by_key(|n| {
        let priority = match n.category.as_str() {
            "docs"   => 0usize,
            "config" => 1,
            _        => 2 + (100usize.saturating_sub(*in_degree.get(n.id.as_str()).unwrap_or(&0))),
        };
        priority
    });

    sorted.iter().take(30).enumerate().map(|(i, n)| {
        let layer = layer_from_path(&n.file_path);
        let reason = if i < 3 { "project entry point".to_string() }
            else if n.category == "config" { "configuration".to_string() }
            else { format!("in-degree {}", in_degree.get(n.id.as_str()).unwrap_or(&0)) };
        TourStep {
            order: i + 1,
            node_id: n.id.clone(),
            name: n.name.clone(),
            file_path: n.file_path.clone(),
            language: n.language.clone(),
            reason,
            layer: layer.to_string(),
        }
    }).collect()
}

fn tags_for_file(path: &str, lang: &str, category: &str) -> Vec<String> {
    let mut tags = vec![lang.to_lowercase(), category.to_string()];
    if path.contains("test") { tags.push("test".to_string()); }
    if path.contains("auth") { tags.push("auth".to_string()); }
    if path.contains("api")  { tags.push("api".to_string()); }
    tags.dedup();
    tags
}

fn detect_frameworks(root: &str, out: &mut HashSet<String>) {
    let cargo = Path::new(root).join("Cargo.toml");
    if cargo.exists() { out.insert("Rust/Cargo".to_string()); }
    let pkg = Path::new(root).join("package.json");
    if pkg.exists() {
        if let Ok(s) = std::fs::read_to_string(&pkg) {
            if s.contains("\"next\"")    { out.insert("Next.js".to_string()); }
            if s.contains("\"react\"")   { out.insert("React".to_string()); }
            if s.contains("\"vue\"")     { out.insert("Vue".to_string()); }
            if s.contains("\"express\"") { out.insert("Express".to_string()); }
        }
    }
    let req = Path::new(root).join("requirements.txt");
    if req.exists() {
        if let Ok(s) = std::fs::read_to_string(&req) {
            if s.contains("django")  { out.insert("Django".to_string()); }
            if s.contains("fastapi") { out.insert("FastAPI".to_string()); }
            if s.contains("flask")   { out.insert("Flask".to_string()); }
        }
    }
}

pub fn load_graph(target: &str) -> Result<GraphData> {
    let path = Path::new(target).join(GRAPH_DIR).join(GRAPH_FILE);
    let s = std::fs::read_to_string(&path)
        .map_err(|_| anyhow::anyhow!("No graph found. Run: yana-rt graph build {}", target))?;
    Ok(serde_json::from_str(&s)?)
}
