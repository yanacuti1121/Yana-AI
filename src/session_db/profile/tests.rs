use super::*;

fn name(text: &str) -> ProfileName {
    ProfileName::new(text).unwrap_or_else(|error| panic!("{text:?} should be valid: {error}"))
}

#[test]
fn ordinary_names_are_accepted() {
    for text in ["work", "a1", "my-profile_2", "x", "0day", &"a".repeat(32)] {
        assert!(ProfileName::new(text).is_ok(), "{text}");
    }
}

#[test]
fn hostile_or_malformed_names_are_rejected() {
    let long = "a".repeat(33);
    let cases = [
        "", &long, "Work", "../x", "..", ".", "a/b", "a\\b", "/abs", "a b", " a", "a ", "-lead",
        "_lead", "é", "tiếng", "a\0b", "a\nb", "a.b", "a:b", "con", "nul", "com1", "lpt9", "prn",
    ];
    for text in cases {
        assert!(ProfileName::new(text).is_err(), "{text:?} must be rejected");
    }
}

#[test]
fn the_word_default_means_the_default_profile() {
    assert_eq!(name("default"), ProfileName::default_profile());
    assert!(name("default").is_default());
    assert!(!name("work").is_default());
}

#[test]
fn default_profile_keeps_the_legacy_layout() {
    let base = Path::new("/repo");
    let root = StateRoot::for_profile(base, &ProfileName::default_profile());
    assert_eq!(root.dir(), Path::new("/repo/.yana-ai"));
    assert_eq!(root.path(StateKind::ChatHistory), Path::new("/repo/.yana-ai/chat-history"));
    assert_eq!(root.path(StateKind::MemoryL3), Path::new("/repo/.yana-ai/l3.jsonl"));
    assert_eq!(
        root.path(StateKind::WorkspaceEvents),
        Path::new("/repo/.yana-ai/workspace/events")
    );
}

#[test]
fn named_profile_lives_under_profiles() {
    let root = StateRoot::for_profile(Path::new("/repo"), &name("work"));
    assert_eq!(root.dir(), Path::new("/repo/.yana-ai/profiles/work"));
    assert_eq!(root.path(StateKind::SessionsDb), Path::new("/repo/.yana-ai/profiles/work/sessions.db"));
    assert_eq!(root.path(StateKind::Checkpoints), Path::new("/repo/.yana-ai/profiles/work/checkpoints"));
}

#[test]
fn two_profiles_never_share_a_path() {
    let base = Path::new("/repo");
    let a = StateRoot::for_profile(base, &name("alpha"));
    let b = StateRoot::for_profile(base, &name("beta"));
    assert!(!a.dir().starts_with(b.dir()) && !b.dir().starts_with(a.dir()));
    let kinds = [
        StateKind::SessionsDb,
        StateKind::ChatHistory,
        StateKind::MemoryL3,
        StateKind::Checkpoints,
        StateKind::WorkspaceEvents,
    ];
    for kind in kinds {
        assert_ne!(a.path(kind), b.path(kind));
        assert!(a.path(kind).starts_with(a.dir()));
    }
}

#[test]
fn default_profile_paths_never_point_into_another_profiles_directory() {
    let base = Path::new("/repo");
    let default = StateRoot::for_profile(base, &ProfileName::default_profile());
    let profiles_dir = base.join(".yana-ai").join("profiles");
    for kind in [StateKind::SessionsDb, StateKind::ChatHistory, StateKind::MemoryL3, StateKind::Checkpoints, StateKind::WorkspaceEvents] {
        assert!(!default.path(kind).starts_with(&profiles_dir), "{kind:?}");
    }
}

#[test]
fn ensure_dir_creates_only_inside_the_base_and_is_repeatable() {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().join("repo");
    std::fs::create_dir(&base).unwrap();
    let root = StateRoot::for_profile(&base, &name("work"));
    root.ensure_dir().unwrap();
    root.ensure_dir().unwrap();
    assert!(root.dir().is_dir());
    let siblings: Vec<_> = std::fs::read_dir(outer.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(siblings, vec![std::ffi::OsString::from("repo")], "nothing created outside the base");
}

#[cfg(unix)]
#[test]
fn a_symlinked_profiles_directory_cannot_redirect_state_elsewhere() {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().join("repo");
    let elsewhere = outer.path().join("elsewhere");
    std::fs::create_dir_all(base.join(".yana-ai")).unwrap();
    std::fs::create_dir(&elsewhere).unwrap();
    std::os::unix::fs::symlink(&elsewhere, base.join(".yana-ai").join("profiles")).unwrap();
    let root = StateRoot::for_profile(&base, &name("work"));
    assert!(matches!(root.ensure_dir(), Err(ProfileError::EscapesBase(_))));
    assert!(std::fs::read_dir(&elsewhere).unwrap().next().is_none(), "nothing may be written through the link");
}
