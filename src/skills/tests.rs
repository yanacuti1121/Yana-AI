use super::*;
use std::fs;
use std::path::Path;

fn write_skill(root: &Path, dir: &str, frontmatter: &str, body: &str) {
    let folder = root.join(dir);
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("SKILL.md"), format!("---\n{frontmatter}\n---\n{body}")).unwrap();
}

fn user_root(path: &Path) -> Vec<Root> {
    vec![Root { scope: Scope::User, dir: path.to_path_buf() }]
}

#[test]
fn a_valid_skill_is_listed_with_its_fields() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "code-review", "name: code-review\ndescription: Review a diff for bugs\nallowed-tools: Read, Grep\nuser-invocable: false", "Body text\n");
    let found = discover(&user_root(tmp.path()));
    assert_eq!(found.problems, Vec::<Problem>::new());
    let skill = &found.skills[0];
    assert_eq!((skill.name.as_str(), skill.description.as_str(), skill.scope), ("code-review", "Review a diff for bugs", Scope::User));
    assert_eq!(skill.allowed_tools, vec!["Read".to_string(), "Grep".to_string()]);
    assert!(!skill.user_invocable);
}

#[test]
fn defaults_and_yaml_forms_are_accepted() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "a", "name: a\ndescription: |\n  Line one\n  line two\nallowed-tools:\n  - Bash\n  - Read", "x");
    let skill = &discover(&user_root(tmp.path())).skills[0];
    assert_eq!(skill.description, "Line one line two");
    assert_eq!(skill.allowed_tools, vec!["Bash".to_string(), "Read".to_string()]);
    assert!(skill.user_invocable, "invocable by default, as in Claude Code");
}

#[test]
fn a_name_that_differs_from_its_folder_is_a_problem_not_a_skill() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "folder-name", "name: other\ndescription: d", "x");
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty());
    assert!(found.problems[0].reason.contains("does not match the folder name"), "{:?}", found.problems);
}

#[test]
fn unsafe_or_odd_folder_names_are_skipped() {
    let tmp = tempfile::tempdir().unwrap();
    for dir in ["has space", ".hidden", "-leading-dash", "a/../b"] {
        let name = dir.replace('/', "_");
        let folder = tmp.path().join(&name);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("SKILL.md"), format!("---\nname: {name}\ndescription: d\n---\n")).unwrap();
    }
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty(), "{:?}", found.skills);
}

#[test]
fn missing_empty_or_malformed_frontmatter_is_reported() {
    let tmp = tempfile::tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("none")).unwrap();
    fs::write(tmp.path().join("none/SKILL.md"), "just text, no frontmatter\n").unwrap();
    write_skill(tmp.path(), "nodesc", "name: nodesc", "x");
    write_skill(tmp.path(), "broken", "name: [unclosed", "x");
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty());
    assert_eq!(found.problems.len(), 3, "{:?}", found.problems);
}

#[cfg(unix)]
#[test]
fn symlinked_skill_folders_and_files_are_never_followed() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    write_skill(outside.path(), "evil", "name: evil\ndescription: d", "x");
    symlink(outside.path().join("evil"), tmp.path().join("evil")).unwrap();
    fs::create_dir_all(tmp.path().join("linked-file")).unwrap();
    symlink(outside.path().join("evil/SKILL.md"), tmp.path().join("linked-file/SKILL.md")).unwrap();
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty(), "{:?}", found.skills);
    assert_eq!(found.problems.len(), 2, "{:?}", found.problems);
}

#[test]
fn an_oversized_skill_file_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "big", "name: big\ndescription: d", &"x".repeat(MAX_SKILL_FILE_BYTES as usize + 1));
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty());
    assert!(found.problems[0].reason.contains("too large"), "{:?}", found.problems);
}

#[test]
fn control_characters_and_long_text_are_cleaned_in_the_description() {
    let tmp = tempfile::tempdir().unwrap();
    let long = "y".repeat(MAX_DESCRIPTION_CHARS + 50);
    write_skill(tmp.path(), "clean", &format!("name: clean\ndescription: \"a\\u001b[31mred\\u0000b {long}\""), "x");
    let skill = &discover(&user_root(tmp.path())).skills[0];
    assert!(!skill.description.chars().any(|c| c.is_control()), "{:?}", skill.description);
    assert_eq!(skill.description.chars().count(), MAX_DESCRIPTION_CHARS);
}

#[test]
fn a_user_skill_shadows_a_project_skill_of_the_same_name() {
    let user = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    // A repository the user opened must not be able to take over a command the user wrote for themselves.
    write_skill(user.path(), "deploy", "name: deploy\ndescription: user version", "u");
    write_skill(project.path(), "deploy", "name: deploy\ndescription: project version", "p");
    write_skill(user.path(), "only-user", "name: only-user\ndescription: d", "u");
    let found = discover(&roots(Some(&project.path().join("..")), None));
    assert!(found.skills.is_empty());
    let roots = vec![Root { scope: Scope::User, dir: user.path().into() }, Root { scope: Scope::Project, dir: project.path().into() }];
    let found = discover(&roots);
    let names: Vec<_> = found.skills.iter().map(|s| (s.name.as_str(), s.scope)).collect();
    assert_eq!(names, vec![("deploy", Scope::User), ("only-user", Scope::User)]);
    assert!(found.problems.iter().any(|p| p.reason.contains("shadowed by the user skill")), "{:?}", found.problems);
}

#[test]
fn only_this_many_skills_are_read_per_folder() {
    let tmp = tempfile::tempdir().unwrap();
    for i in 0..5 {
        write_skill(tmp.path(), &format!("s{i}"), &format!("name: s{i}\ndescription: d"), "x");
    }
    let found = discover_with_limit(&user_root(tmp.path()), 3);
    assert_eq!(found.skills.len(), 3);
    assert!(found.problems.iter().any(|p| p.reason.contains("more than 3")), "{:?}", found.problems);
}

#[test]
fn the_body_drops_the_frontmatter() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "b", "name: b\ndescription: d", "# Title\n\nDo the thing.\n");
    let found = discover(&user_root(tmp.path()));
    assert_eq!(read_body(&found.skills[0]).unwrap(), "# Title\n\nDo the thing.\n");
}

#[cfg(unix)]
#[test]
fn a_file_swapped_for_a_symlink_after_discovery_is_not_read() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "swap", "name: swap\ndescription: d", "safe");
    let found = discover(&user_root(tmp.path()));
    let secret = tmp.path().join("secret.txt");
    fs::write(&secret, "TOP SECRET").unwrap();
    fs::remove_file(tmp.path().join("swap/SKILL.md")).unwrap();
    symlink(&secret, tmp.path().join("swap/SKILL.md")).unwrap();
    let error = read_body(&found.skills[0]).unwrap_err();
    assert!(error.to_string().contains("symbolic link"), "{error}");
}

#[test]
fn roots_cover_the_project_and_the_user_folder() {
    let roots = roots(Some(Path::new("/p")), Some(Path::new("/h/.yana")));
    // The user's own folder comes first: on a name clash it wins over the project's.
    assert_eq!(roots[0].dir, Path::new("/h/.yana/skills"));
    assert_eq!((roots[0].scope, roots[1].scope), (Scope::User, Scope::Project));
    assert_eq!(roots[1].dir, Path::new("/p/.yana-ai/skills"));
    assert!(super::roots(None, None).is_empty());
}

#[test]
fn a_description_with_colons_is_read_even_when_it_is_not_strict_yaml() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "loose", "name: loose\ndescription: Use when: the user asks: for a review (a→b, 150+ x)\nallowed-tools: Read, Grep\nuser-invocable: false\nlicense: MIT", "x");
    let found = discover(&user_root(tmp.path()));
    assert_eq!(found.problems, Vec::<Problem>::new());
    let skill = &found.skills[0];
    assert_eq!(skill.description, "Use when: the user asks: for a review (a→b, 150+ x)");
    assert_eq!(skill.allowed_tools, vec!["Read".to_string(), "Grep".to_string()]);
    assert!(!skill.user_invocable);
}

#[test]
fn the_fallback_still_requires_a_matching_name_and_a_description() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "wrong", "name: other: x\ndescription: a: b", "x");
    write_skill(tmp.path(), "nodesc", "name: nodesc\ntitle: a: b", "x");
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty(), "{:?}", found.skills);
    assert_eq!(found.problems.len(), 2, "{:?}", found.problems);
}

#[test]
fn yaml_features_that_can_blow_up_are_not_interpreted() {
    let tmp = tempfile::tempdir().unwrap();
    // A "billion laughs" frontmatter: each level repeats the one before through aliases.
    let mut front = String::from("name: bomb\ndescription: fine\nl0: &a0 [\"x\",\"x\",\"x\",\"x\",\"x\",\"x\",\"x\",\"x\",\"x\"]\n");
    for level in 1..9 {
        let refs = vec![format!("*a{}", level - 1); 9].join(",");
        front.push_str(&format!("l{level}: &a{level} [{refs}]\n"));
    }
    write_skill(tmp.path(), "bomb", &front, "x");
    let started = std::time::Instant::now();
    let found = discover(&user_root(tmp.path()));
    assert!(started.elapsed() < std::time::Duration::from_millis(500), "{:?}", started.elapsed());
    assert_eq!(found.problems, Vec::<Problem>::new());
    assert_eq!(found.skills[0].description, "fine");
}

#[test]
fn tags_merge_keys_and_nesting_are_just_text_or_ignored() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "odd", "name: odd\ndescription: !!python/object:os.system x\nmeta:\n  a:\n    b:\n      c: 1\n<<: *base", "x");
    let found = discover(&user_root(tmp.path()));
    assert_eq!(found.problems, Vec::<Problem>::new());
    assert_eq!(found.skills[0].description, "!!python/object:os.system x");
}

#[test]
fn quoted_values_and_inline_lists_are_read() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "q", "name: \"q\"\ndescription: 'It''s quoted'\nallowed-tools: [Read, \"Grep\"]\nuser-invocable: true", "x");
    let skill = &discover(&user_root(tmp.path())).skills[0];
    assert_eq!(skill.name, "q");
    assert_eq!(skill.allowed_tools, vec!["Read".to_string(), "Grep".to_string()]);
    assert!(skill.description.starts_with("It"), "{}", skill.description);
}

#[test]
fn an_unterminated_quote_or_list_is_reported() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "badquote", "name: badquote\ndescription: \"never closed", "x");
    write_skill(tmp.path(), "badlist", "name: badlist\ndescription: d\nallowed-tools: [Read, Grep", "x");
    let found = discover(&user_root(tmp.path()));
    assert!(found.skills.is_empty(), "{:?}", found.skills);
    assert_eq!(found.problems.len(), 2, "{:?}", found.problems);
}

#[test]
fn a_quoted_description_may_continue_over_several_lines() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "multi", "name: multi\ndescription: 'Parses logs (a, b)\n  to find x. Use when: asked\n  for a review.'\nlicense: MIT", "x");
    write_skill(tmp.path(), "dq", "name: dq\ndescription: \"first part\n  second part\"", "x");
    let found = discover(&user_root(tmp.path()));
    assert_eq!(found.problems, Vec::<Problem>::new());
    let by_name = |name: &str| found.skills.iter().find(|s| s.name == name).unwrap().description.clone();
    assert_eq!(by_name("multi"), "Parses logs (a, b) to find x. Use when: asked for a review.");
    assert_eq!(by_name("dq"), "first part second part");
}

#[test]
fn a_plain_description_may_continue_over_several_lines() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "plain", "name: plain\ndescription: Extract and analyze hives to uncover activity,\n  installed software, and more.\nlicense: MIT", "x");
    let skill = &discover(&user_root(tmp.path())).skills[0];
    assert_eq!(skill.description, "Extract and analyze hives to uncover activity, installed software, and more.");
}

#[test]
fn escapes_in_a_double_quoted_description_are_decoded() {
    let tmp = tempfile::tempdir().unwrap();
    write_skill(tmp.path(), "esc", "name: esc\ndescription: \"He said \\\"hi\\\" and used a back\\\\slash\"", "x");
    let skill = &discover(&user_root(tmp.path())).skills[0];
    assert_eq!(skill.description, "He said \"hi\" and used a back\\slash");
}
