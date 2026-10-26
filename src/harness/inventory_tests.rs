use super::inventory::*;
use std::fs;
use std::path::Path;

#[test]
fn parses_flat_frontmatter_and_ignores_nested_lines() {
    let text = "---\nname: security-auditor\ndescription: \"Finds bugs\"\ntools: Read, Grep,  Bash\nmodel: sonnet\nmetadata:\n  type: x\n---\n# Body\n";
    let front = parse_frontmatter(text);
    assert!(front.present);
    assert_eq!(front.name.as_deref(), Some("security-auditor"));
    assert_eq!(front.description.as_deref(), Some("Finds bugs"));
    assert_eq!(front.tools, ["Read", "Grep", "Bash"]);
    assert_eq!(front.model.as_deref(), Some("sonnet"));
}

#[test]
fn missing_or_unclosed_frontmatter_is_not_present() {
    assert!(!parse_frontmatter("# just a heading\n").present);
    assert!(!parse_frontmatter("").present);
    assert!(!parse_frontmatter("---\nname: x\nno closing fence\n").present);
    assert!(parse_frontmatter("---\r\nname: x\r\n---\r\n").present);
}

#[test]
fn empty_values_count_as_missing() {
    let front = parse_frontmatter("---\nname:\ndescription: \"\"\n---\n");
    assert!(front.present && front.name.is_none() && front.description.is_none());
}

fn write(dir: &Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

#[test]
fn scans_agents_and_only_top_level_skill_files() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/a.md",
        "---\nname: a\ndescription: d\n---\n",
    );
    write(dir.path(), "core/agents/README.md", "# docs");
    write(
        dir.path(),
        "core/agents/team/b.md",
        "---\nname: b\ndescription: d\n---\n",
    );
    write(
        dir.path(),
        "core/skills/s/SKILL.md",
        "---\nname: s\ndescription: d\n---\n",
    );
    write(
        dir.path(),
        "core/skills/s/references/SKILL.md",
        "---\nname: nested\n---\n",
    );
    write(
        dir.path(),
        ".claude/skills/s/SKILL.md",
        "---\nname: s\ndescription: d\n---\n",
    );
    let inventory = scan(dir.path());
    let mut found: Vec<String> = inventory.entries.iter().map(|e| e.path.clone()).collect();
    found.sort();
    assert_eq!(
        found,
        [
            ".claude/skills/s/SKILL.md",
            "core/agents/a.md",
            "core/agents/team/b.md",
            "core/skills/s/SKILL.md"
        ]
    );
    let skill = inventory
        .entries
        .iter()
        .find(|e| e.path == "core/skills/s/SKILL.md")
        .unwrap();
    assert_eq!(skill.dir_name.as_deref(), Some("s"));
    assert_eq!(skill.rel, "s/SKILL.md");
}

#[cfg(unix)]
#[test]
fn does_not_follow_a_symlink_out_of_the_project() {
    let outside = tempfile::tempdir().unwrap();
    write(
        outside.path(),
        "x/SKILL.md",
        "---\nname: x\ndescription: d\n---\n",
    );
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("core/skills")).unwrap();
    std::os::unix::fs::symlink(outside.path().join("x"), dir.path().join("core/skills/x")).unwrap();
    assert!(scan(dir.path()).entries.is_empty());
}

#[test]
fn all_caps_files_beside_agents_are_persona_docs_not_agents() {
    assert!(
        is_persona_doc("IDENTITY.md")
            && is_persona_doc("SOUL.md")
            && is_persona_doc("CAPABILITIES.md")
    );
    assert!(
        !is_persona_doc("security-auditor.md")
            && !is_persona_doc("Yana.md")
            && !is_persona_doc(".md")
    );
}

#[test]
fn an_empty_project_scans_to_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let inventory = scan(dir.path());
    assert!(inventory.entries.is_empty() && inventory.skipped.is_empty());
}
