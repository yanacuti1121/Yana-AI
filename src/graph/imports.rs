//! Tree-sitter-based import extraction for `src/graph/build.rs`.
//!
//! Split out 2026-07-23 (Wave 0 finding #2 follow-up,
//! `docs/PLATFORM-READINESS-WAVE0.md`) to replace the previous per-language
//! regex extraction, which was the root cause of the graph's noisy edges
//! this doc names: a plain regex over the whole file has no idea whether
//! it matched real code or a comment/string containing similar text (e.g.
//! `// TODO: use crate::foo::bar later` used to be extracted as a real
//! Rust import). A real parser can't make that mistake — it only descends
//! into nodes the grammar says are use/import declarations.
//!
//! Deliberately NOT expanding scope beyond what the old regex covered:
//! CommonJS `require(...)` calls are still not extracted (the old code
//! didn't either) — adding that is a real, separate feature, not part of
//! this fix. TypeScript's TSX-vs-TS grammar split is also collapsed to
//! one code path (`LANGUAGE_TYPESCRIPT` used for both `.ts` and `.tsx`) —
//! tree-sitter's error recovery still finds leading `import` statements
//! correctly even in a `.tsx` file whose JSX bodies that grammar can't
//! fully parse, so a dedicated TSX parser isn't needed just for imports.

use tree_sitter::{Language, Node, Parser};

/// Public entry point — same signature as the regex version it replaces.
/// Returns an empty vec (not a panic) for a language with no grammar
/// wired up, or if the source fails to parse at all.
pub(super) fn extract_imports(content: &str, lang: &str) -> Vec<String> {
    let language: Language = match lang {
        "Rust" => tree_sitter_rust::LANGUAGE.into(),
        "TypeScript" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        "JavaScript" => tree_sitter_javascript::LANGUAGE.into(),
        "Python" => tree_sitter_python::LANGUAGE.into(),
        "Go" => tree_sitter_go::LANGUAGE.into(),
        _ => return Vec::new(),
    };

    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return Vec::new();
    }
    let Some(tree) = parser.parse(content, None) else {
        return Vec::new();
    };

    let mut imports = Vec::new();
    let source = content.as_bytes();
    walk_top_level(tree.root_node(), source, lang, &mut imports);
    imports
}

fn node_text<'a>(node: Node, source: &'a [u8]) -> &'a str {
    std::str::from_utf8(&source[node.byte_range()]).unwrap_or("")
}

/// Strip the surrounding quotes from a string-literal node's text (works
/// for both `"..."` and `'...'` forms, and Go's raw `` `...` `` strings).
fn strip_quotes(text: &str) -> &str {
    let text = text.trim();
    if text.len() >= 2 {
        let bytes = text.as_bytes();
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' || first == b'\'' || first == b'`') && first == last {
            return &text[1..text.len() - 1];
        }
    }
    text
}

/// Only descend into top-level (and Go's block-level import list) nodes —
/// import/use declarations don't appear nested inside function bodies in
/// any of these languages in a way this graph cares about, and stopping
/// early keeps this a cheap single pass over each file rather than a full
/// tree walk.
fn walk_top_level(node: Node, source: &[u8], lang: &str, out: &mut Vec<String>) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match (lang, child.kind()) {
            ("Rust", "use_declaration") => {
                if let Some(arg) = child.child_by_field_name("argument") {
                    walk_rust_use(arg, source, "", out);
                }
            }
            ("TypeScript" | "JavaScript", "import_statement") => {
                if let Some(src) = child.child_by_field_name("source") {
                    out.push(strip_quotes(node_text(src, source)).to_string());
                }
            }
            ("Python", "import_statement") => {
                collect_python_names(child, source, out);
            }
            ("Python", "import_from_statement") => {
                if let Some(module) = child.child_by_field_name("module_name") {
                    out.push(node_text(module, source).replace('.', "/"));
                }
            }
            ("Go", "import_declaration") => {
                let mut inner = child.walk();
                for spec_container in child.children(&mut inner) {
                    match spec_container.kind() {
                        "import_spec" => collect_go_spec(spec_container, source, out),
                        "import_spec_list" => {
                            let mut list_cursor = spec_container.walk();
                            for spec in spec_container.children(&mut list_cursor) {
                                if spec.kind() == "import_spec" {
                                    collect_go_spec(spec, source, out);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

fn collect_go_spec(spec: Node, source: &[u8], out: &mut Vec<String>) {
    if let Some(path) = spec.child_by_field_name("path") {
        out.push(strip_quotes(node_text(path, source)).to_string());
    }
}

fn collect_python_names(import_stmt: Node, source: &[u8], out: &mut Vec<String>) {
    let mut cursor = import_stmt.walk();
    for child in import_stmt.children(&mut cursor) {
        match child.kind() {
            "dotted_name" => out.push(node_text(child, source).replace('.', "/")),
            "aliased_import" => {
                if let Some(name) = child.child_by_field_name("name") {
                    out.push(node_text(name, source).replace('.', "/"));
                }
            }
            _ => {}
        }
    }
}

/// Recursively flatten a Rust `use_declaration`'s argument into one or
/// more `/`-joined paths — handles plain paths, `as` aliases (alias
/// itself is irrelevant to resolution, only the real path matters),
/// wildcards, and arbitrarily nested `{...}` groups
/// (`use a::{b, c::{d, e}}`).
fn walk_rust_use(node: Node, source: &[u8], prefix: &str, out: &mut Vec<String>) {
    let join = |prefix: &str, seg: &str| -> String {
        if prefix.is_empty() { seg.to_string() } else { format!("{prefix}/{seg}") }
    };
    match node.kind() {
        "identifier" | "self" | "crate" | "super" => {
            out.push(join(prefix, node_text(node, source)));
        }
        "scoped_identifier" => {
            out.push(join(prefix, &node_text(node, source).replace("::", "/")));
        }
        "use_as_clause" => {
            if let Some(path) = node.child_by_field_name("path") {
                walk_rust_use(path, source, prefix, out);
            }
        }
        "use_wildcard" => {
            // `use foo::bar::*` — the meaningful target is the module
            // path itself (`foo/bar`), not a specific item name.
            if let Some(path_child) = node.named_child(0) {
                out.push(join(prefix, &node_text(path_child, source).replace("::", "/")));
            }
        }
        "use_list" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() {
                    walk_rust_use(child, source, prefix, out);
                }
            }
        }
        "scoped_use_list" => {
            if let (Some(path), Some(list)) =
                (node.child_by_field_name("path"), node.child_by_field_name("list"))
            {
                let new_prefix = join(prefix, &node_text(path, source).replace("::", "/"));
                walk_rust_use(list, source, &new_prefix, out);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::extract_imports;

    #[test]
    fn rust_simple_and_scoped() {
        let src = "use std::collections::HashMap;\nuse crate::guard::lock;\n";
        let imports = extract_imports(src, "Rust");
        assert!(imports.contains(&"std/collections/HashMap".to_string()), "{imports:?}");
        assert!(imports.contains(&"crate/guard/lock".to_string()), "{imports:?}");
    }

    #[test]
    fn rust_grouped_use_with_alias() {
        let src = "use crate::graph::{build, imports as imp, types::Node};\n";
        let imports = extract_imports(src, "Rust");
        assert!(imports.contains(&"crate/graph/build".to_string()), "{imports:?}");
        assert!(imports.contains(&"crate/graph/imports".to_string()), "{imports:?}");
        assert!(imports.contains(&"crate/graph/types/Node".to_string()), "{imports:?}");
    }

    #[test]
    fn rust_wildcard() {
        let src = "use crate::graph::types::*;\n";
        let imports = extract_imports(src, "Rust");
        assert!(imports.contains(&"crate/graph/types".to_string()), "{imports:?}");
    }

    #[test]
    fn rust_ignores_comment_and_string_lookalikes() {
        // This exact false-positive is why this file exists — a plain
        // regex over the whole file used to extract this as a real import.
        let src = "// TODO: use crate::foo::bar later\nlet s = \"use crate::not::real\";\n";
        let imports = extract_imports(src, "Rust");
        assert!(imports.is_empty(), "{imports:?}");
    }

    #[test]
    fn typescript_import_source() {
        let src = "import { foo } from './local';\nimport bar from \"some-package\";\n";
        let imports = extract_imports(src, "TypeScript");
        assert!(imports.contains(&"./local".to_string()), "{imports:?}");
        assert!(imports.contains(&"some-package".to_string()), "{imports:?}");
    }

    #[test]
    fn javascript_import_source() {
        let src = "import React from 'react';\n";
        let imports = extract_imports(src, "JavaScript");
        assert_eq!(imports, vec!["react".to_string()]);
    }

    #[test]
    fn python_import_and_from_import() {
        let src = "import os.path\nfrom collections import OrderedDict\n";
        let imports = extract_imports(src, "Python");
        assert!(imports.contains(&"os/path".to_string()), "{imports:?}");
        assert!(imports.contains(&"collections".to_string()), "{imports:?}");
    }

    #[test]
    fn python_aliased_import() {
        let src = "import numpy as np\n";
        let imports = extract_imports(src, "Python");
        assert!(imports.contains(&"numpy".to_string()), "{imports:?}");
    }

    #[test]
    fn go_single_and_grouped_imports() {
        let src = "import \"fmt\"\n\nimport (\n\t\"os\"\n\t\"strings\"\n)\n";
        let imports = extract_imports(src, "Go");
        assert!(imports.contains(&"fmt".to_string()), "{imports:?}");
        assert!(imports.contains(&"os".to_string()), "{imports:?}");
        assert!(imports.contains(&"strings".to_string()), "{imports:?}");
    }

    #[test]
    fn unsupported_language_returns_empty() {
        assert!(extract_imports("anything", "Java").is_empty());
    }

    #[test]
    fn empty_source_returns_empty() {
        assert!(extract_imports("", "Rust").is_empty());
    }
}
