use super::*;

fn args(extra: Value) -> Value {
    let mut base = json!({"server": "rust", "operation": "definition", "path": "src/main.rs", "line": 10, "character": 4});
    for (k, v) in extra.as_object().unwrap() {
        base[k] = v.clone();
    }
    base
}

#[test]
fn a_valid_query_is_parsed_and_positions_are_one_based() {
    let query = parse_query(&args(json!({}))).unwrap();
    assert_eq!((query.server.as_str(), query.operation, query.path.as_str(), query.line, query.character), ("rust", Operation::Definition, "src/main.rs", 10, 4));
    let symbols = parse_query(&args(json!({"operation": "document_symbols", "line": null, "character": null}))).unwrap();
    assert_eq!(symbols.operation, Operation::DocumentSymbols, "a position is not needed for a document's symbols");
}

#[test]
fn anything_malformed_is_refused_before_a_server_is_involved() {
    let bad = [
        json!({"server": "Rust Server"}),
        json!({"server": ""}),
        json!({"operation": "rename"}),
        json!({"operation": "applyEdit"}),
        json!({"path": ""}),
        json!({"path": "/etc/passwd"}),
        json!({"path": "../outside.rs"}),
        json!({"path": "a/../../b.rs"}),
        json!({"path": "C:\\x.rs"}),
        json!({"path": "a\nb.rs"}),
        json!({"path": "a\u{202e}b.rs"}),
        json!({"path": "x".repeat(MAX_PATH_CHARS + 1)}),
        json!({"line": 0}),
        json!({"line": -1}),
        json!({"line": "ten"}),
        json!({"line": 10_000_001u64}),
        json!({"character": 0}),
        json!({"character": 1.5}),
    ];
    for case in bad {
        assert!(parse_query(&args(case.clone())).is_err(), "{case}");
    }
    for missing in ["server", "operation", "path", "line", "character"] {
        let mut incomplete = args(json!({}));
        incomplete.as_object_mut().unwrap().remove(missing);
        assert!(parse_query(&incomplete).is_err(), "missing {missing}");
    }
    assert!(parse_query(&json!("not an object")).is_err());
}

#[test]
fn columns_convert_between_characters_and_utf16_units() {
    assert_eq!(utf16_offset("let x = 1;", 5), 4, "ASCII: character 5 is offset 4");
    // U+1F600 is two UTF-16 units: the character after it is at offset 2, not 1.
    assert_eq!(utf16_offset("\u{1f600}ab", 2), 2);
    assert_eq!(utf16_offset("\u{4e2d}ab", 2), 1, "a BMP character is one unit");
    assert_eq!(utf16_offset("abc", 99), 3, "past the end is the end");
    assert_eq!(utf16_offset("abc", 0), 0);
    assert_eq!(character_at("\u{1f600}ab", 2), 2, "offset 2 is the second character");
    assert_eq!(character_at("abc", 0), 1);
    assert_eq!(character_at("abc", 3), 4, "the end of the line");
}

#[test]
fn request_params_have_the_shape_servers_expect_and_zero_based_positions() {
    let query = parse_query(&args(json!({"operation": "references"}))).unwrap();
    let params = request_params(&query, "file:///r/src/main.rs", "    let value = 1;");
    assert_eq!(params["position"], json!({"line": 9, "character": 3}));
    assert_eq!(params["context"]["includeDeclaration"], true);
    let symbols = parse_query(&args(json!({"operation": "document_symbols"}))).unwrap();
    assert_eq!(request_params(&symbols, "file:///r/a.rs", ""), json!({"textDocument": {"uri": "file:///r/a.rs"}}));
}

#[cfg(unix)]
#[test]
fn uris_inside_the_repository_become_relative_paths_and_everything_else_is_refused() {
    let root = Path::new("/work/repo");
    assert_eq!(relative_from_uri(root, "file:///work/repo/src/lib.rs"), Some("src/lib.rs".into()));
    assert_eq!(relative_from_uri(root, "file:///work/repo/a%20b/c.rs"), Some("a b/c.rs".into()), "percent-encoding is decoded");
    for outside in [
        "file:///work/other/x.rs",
        "file:///work/repo",
        "file:///work/repo/../other/x.rs",
        "file:///work/repo/..%2f..%2fetc/passwd",
        "file:///work/repo/%2e%2e%2f%2e%2e%2fetc/passwd",
        "file:///work/repo/a%5c..%5cb.rs",
        "file:///work/repo/a%00b.rs",
        "file:///etc/passwd",
        "file:///work/repository/x.rs",
        "http://work/repo/x.rs",
        "https://evil.example/work/repo/x.rs",
        "untitled:Untitled-1",
        "not a uri",
        "",
    ] {
        assert_eq!(relative_from_uri(root, outside), None, "{outside}");
    }
}

#[test]
fn files_that_hold_secrets_are_recognised_by_name() {
    for secret in [
        ".env", "app/.env.production", "prod.env", "certs/server.pem", "a/b/private.key", "id_rsa", ".npmrc", ".git/config", "config/api_token.json", "credentials.json", "my_secret.txt", ".ENV", "Config/.Env.Local",
        ".envrc", ".env_local", ".netrc", ".pgpass", "id_ecdsa", "a/key.p8", "app.jks", "infra/terraform.tfstate", "prod.tfvars", ".kube/config", ".aws/config", ".docker/config.json", ".ssh/known_hosts",
        ".yana-ai/leases.json", "dir\\.env", ".env.",
    ] {
        assert!(sensitive_path(secret));
    }
    for fine in ["src/main.rs", "README.md", "docs/environment.md", "src/lib/envelope.rs", "src/tokenizer.rs", "src/secret_sharing.rs", "src/credentials_provider.py"] {
        assert!(!sensitive_path(fine), "{fine}");
    }
    assert!(parse_query(&args(json!({"path": "config/.env"}))).is_err(), "a query about a secrets file is refused");
}

#[cfg(unix)]
#[test]
fn a_path_becomes_a_file_uri_under_the_root() {
    let uri = file_uri(Path::new("/work/repo"), "src/my file.rs").unwrap();
    assert_eq!(uri, "file:///work/repo/src/my%20file.rs");
    assert_eq!(relative_from_uri(Path::new("/work/repo"), &uri), Some("src/my file.rs".into()), "round trip");
}
