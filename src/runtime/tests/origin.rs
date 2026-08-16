use super::super::TurnOrigin;
use super::fixtures::context;

#[test]
fn subagent_context_preserves_parent_origin() {
    let parent = context("s1", TurnOrigin::Codex);
    let child = parent.for_subagent("reviewer");
    assert_eq!(child.origin, TurnOrigin::Subagent);
    assert_eq!(child.parent_origin, Some(TurnOrigin::Codex));
    assert_eq!(child.session_id, parent.session_id);
    assert_eq!(child.workspace, parent.workspace);
    assert!(!child.is_human_initiated());
}
