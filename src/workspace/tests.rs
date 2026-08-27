use super::domain::{ActionStatus, AttentionClass, BlockKind, RiskLevel, WorkspaceEventKind};
use super::triage;
use super::markdown::{MarkdownExporter, WorkspaceExporter};
use super::service::{WorkspaceOperation, WorkspaceService};
use super::store::{EventStore, FileEventStore};
use tempfile::TempDir;

fn fixture() -> (TempDir, WorkspaceService<FileEventStore>) {
    let temp = TempDir::new().unwrap();
    let service = WorkspaceService::new(FileEventStore::new(temp.path()));
    (temp, service)
}

fn create(
    service: &WorkspaceService<FileEventStore>,
    title: &str,
    attention: AttentionClass,
) -> String {
    let event = service
        .execute(WorkspaceOperation::CreateBlock {
            kind: BlockKind::Task,
            title: title.into(),
            body: format!("body for {title}"),
            attention,
            actor: "human:test".into(),
        })
        .unwrap();
    match event.kind {
        WorkspaceEventKind::BlockCreated { block } => block.id,
        _ => panic!("unexpected event"),
    }
}

#[test]
fn triage_is_conservative_and_explainable() {
    assert_eq!(triage("Production incident: deploy is blocked").attention, AttentionClass::Signal);
    assert_eq!(triage("Weekly newsletter — unsubscribe anytime").attention, AttentionClass::Noise);
    assert_eq!(triage("Notes from the project sync").attention, AttentionClass::Review);
}

#[test]
fn blocks_round_trip_through_atomic_event_store() {
    let (temp, service) = fixture();
    let id = create(&service, "first", AttentionClass::Signal);
    let files: Vec<_> = std::fs::read_dir(service_store(&temp).event_dir())
        .unwrap()
        .collect();
    assert_eq!(files.len(), 1);
    let state = service.state().unwrap();
    assert_eq!(state.blocks[&id].title, "first");
}

#[test]
fn links_are_navigable_from_both_ends() {
    let (_temp, service) = fixture();
    let task = create(&service, "task", AttentionClass::Signal);
    let message = create(&service, "message", AttentionClass::Review);
    service
        .execute(WorkspaceOperation::LinkBlocks {
            source: task.clone(),
            target: message.clone(),
            relation: "originated_from".into(),
            actor: "human:test".into(),
        })
        .unwrap();
    let state = service.state().unwrap();
    assert_eq!(state.related(&task)[0].0.id, message);
    assert_eq!(state.related(&message)[0].0.id, task);
}

#[test]
fn invalid_or_self_links_fail_before_persistence() {
    let (_temp, service) = fixture();
    let task = create(&service, "task", AttentionClass::Signal);
    let error = service
        .execute(WorkspaceOperation::LinkBlocks {
            source: task.clone(),
            target: task,
            relation: "same".into(),
            actor: "human:test".into(),
        })
        .unwrap_err();
    assert!(error.contains("self-links"));
    assert!(service.state().unwrap().links.is_empty());
}

#[test]
fn inbox_hides_noise_without_losing_it() {
    let (_temp, service) = fixture();
    create(&service, "signal", AttentionClass::Signal);
    create(&service, "noise", AttentionClass::Noise);
    let state = service.state().unwrap();
    assert_eq!(state.inbox(false).len(), 1);
    assert_eq!(state.inbox(true).len(), 2);
    assert_eq!(state.blocks.len(), 2);
}

#[test]
fn deterministic_memory_keeps_explicit_source_links() {
    let (_temp, service) = fixture();
    let first = create(&service, "decision", AttentionClass::Signal);
    let second = create(&service, "evidence", AttentionClass::Review);
    let event = service
        .execute(WorkspaceOperation::SynthesizeMemory {
            title: "release memory".into(),
            source_ids: vec![first.clone(), second.clone()],
            actor: "yana-rt".into(),
        })
        .unwrap();
    let memory_id = match event.kind {
        WorkspaceEventKind::MemorySynthesized {
            memory, source_ids, ..
        } => {
            assert_eq!(source_ids, vec![first, second]);
            assert!(memory.body.contains("explicit workspace sources"));
            memory.id
        }
        _ => panic!("unexpected event"),
    };
    let state = service.state().unwrap();
    assert_eq!(state.related(&memory_id).len(), 2);
}

#[test]
fn only_critical_actions_wait_for_a_human() {
    let (_temp, service) = fixture();
    let block = create(&service, "deploy", AttentionClass::Signal);
    for risk in [RiskLevel::Low, RiskLevel::Medium, RiskLevel::High] {
        let event = service
            .execute(WorkspaceOperation::RequestAction {
                block_id: block.clone(),
                description: "safe governed operation".into(),
                risk,
                actor: "agent:worker".into(),
            })
            .unwrap();
        match event.kind {
            WorkspaceEventKind::ActionRequested { action } => {
                assert_eq!(action.status, ActionStatus::AutoApproved)
            }
            _ => panic!("unexpected event"),
        }
    }
    let event = service
        .execute(WorkspaceOperation::RequestAction {
            block_id: block,
            description: "production mutation".into(),
            risk: RiskLevel::Critical,
            actor: "agent:worker".into(),
        })
        .unwrap();
    match event.kind {
        WorkspaceEventKind::ActionRequested { action } => {
            assert_eq!(action.status, ActionStatus::PendingHuman)
        }
        _ => panic!("unexpected event"),
    }
}

#[test]
fn critical_approval_rejects_non_human_identity() {
    let (_temp, service) = fixture();
    let block = create(&service, "deploy", AttentionClass::Signal);
    let request = service
        .execute(WorkspaceOperation::RequestAction {
            block_id: block,
            description: "production mutation".into(),
            risk: RiskLevel::Critical,
            actor: "agent:worker".into(),
        })
        .unwrap();
    let action_id = match request.kind {
        WorkspaceEventKind::ActionRequested { action } => action.id,
        _ => panic!("unexpected event"),
    };
    assert!(service
        .execute(WorkspaceOperation::ApproveAction {
            action_id: action_id.clone(),
            approver: "agent:worker".into(),
        })
        .is_err());
    service
        .execute(WorkspaceOperation::ApproveAction {
            action_id: action_id.clone(),
            approver: "human:tam".into(),
        })
        .unwrap();
    assert_eq!(
        service.state().unwrap().actions[&action_id].status,
        ActionStatus::HumanApproved
    );
}

#[test]
fn operation_is_serializable_for_cli_and_mcp_adapters() {
    let operation = WorkspaceOperation::CreateBlock {
        kind: BlockKind::Document,
        title: "architecture".into(),
        body: "ports and adapters".into(),
        attention: AttentionClass::Signal,
        actor: "agent:architect".into(),
    };
    let json = serde_json::to_string(&operation).unwrap();
    let decoded: WorkspaceOperation = serde_json::from_str(&json).unwrap();
    assert!(matches!(decoded, WorkspaceOperation::CreateBlock { .. }));
}

#[test]
fn markdown_export_is_portable_and_contains_links() {
    let (temp, service) = fixture();
    let first = create(&service, "task", AttentionClass::Signal);
    let second = create(&service, "message", AttentionClass::Review);
    service
        .execute(WorkspaceOperation::LinkBlocks {
            source: first.clone(),
            target: second.clone(),
            relation: "originated_from".into(),
            actor: "human:test".into(),
        })
        .unwrap();
    let paths = MarkdownExporter::new(temp.path().join("export"))
        .export(&service.state().unwrap())
        .unwrap();
    assert_eq!(paths.len(), 3);
    let first_doc =
        std::fs::read_to_string(temp.path().join("export").join(format!("{first}.md"))).unwrap();
    assert!(first_doc.contains("## Related"));
    assert!(first_doc.contains(&format!("{second}.md")));
}

#[test]
fn malformed_event_fails_loud_instead_of_being_skipped() {
    let (temp, service) = fixture();
    let store = service_store(&temp);
    std::fs::create_dir_all(store.event_dir()).unwrap();
    std::fs::write(store.event_dir().join("bad.json"), "not-json").unwrap();
    assert!(service
        .state()
        .unwrap_err()
        .contains("parsing workspace event"));
}

fn service_store(temp: &TempDir) -> FileEventStore {
    FileEventStore::new(temp.path())
}

#[test]
fn store_trait_loads_events_in_deterministic_order() {
    let (temp, service) = fixture();
    create(&service, "a", AttentionClass::Signal);
    create(&service, "b", AttentionClass::Signal);
    let events = service_store(&temp).load().unwrap();
    assert_eq!(events.len(), 2);
    assert!(events[0].occurred_at <= events[1].occurred_at);
}

#[test]
fn existing_event_id_is_never_overwritten() {
    let (temp, service) = fixture();
    create(&service, "original", AttentionClass::Signal);
    let store = service_store(&temp);
    let event = store.load().unwrap().remove(0);
    assert!(store.append(&event).unwrap_err().contains("already exists"));
    assert_eq!(store.load().unwrap().len(), 1);
}

#[test]
fn concurrent_process_style_writers_do_not_lose_events() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().to_path_buf();
    let handles: Vec<_> = (0..20)
        .map(|index| {
            let root = root.clone();
            std::thread::spawn(move || {
                WorkspaceService::new(FileEventStore::new(root))
                    .execute(WorkspaceOperation::CreateBlock {
                        kind: BlockKind::AgentAction,
                        title: format!("writer-{index}"),
                        body: String::new(),
                        attention: AttentionClass::Review,
                        actor: format!("agent:{index}"),
                    })
                    .unwrap();
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    let state = WorkspaceService::new(FileEventStore::new(temp.path()))
        .state()
        .unwrap();
    assert_eq!(state.blocks.len(), 20);
}

#[test]
fn concurrent_human_approval_events_preserve_the_first_decision() {
    let (_temp, service) = fixture();
    let block_id = create(&service, "critical", AttentionClass::Signal);
    let requested = service
        .execute(WorkspaceOperation::RequestAction {
            block_id,
            description: "deploy production".into(),
            risk: RiskLevel::Critical,
            actor: "agent:release".into(),
        })
        .unwrap();
    let action_id = match requested.kind {
        WorkspaceEventKind::ActionRequested { action } => action.id,
        _ => panic!("unexpected event"),
    };
    let mut state = service.state().unwrap();
    let first = super::domain::WorkspaceEvent {
        id: "approval-a".into(),
        occurred_at: "2026-08-13T00:00:00Z".into(),
        actor: "human:alice".into(),
        kind: WorkspaceEventKind::ActionApproved {
            action_id: action_id.clone(),
            approver: "human:alice".into(),
            approved_at: "2026-08-13T00:00:00Z".into(),
        },
    };
    let second = super::domain::WorkspaceEvent {
        id: "approval-b".into(),
        occurred_at: "2026-08-13T00:00:00Z".into(),
        actor: "human:bob".into(),
        kind: WorkspaceEventKind::ActionApproved {
            action_id: action_id.clone(),
            approver: "human:bob".into(),
            approved_at: "2026-08-13T00:00:00Z".into(),
        },
    };
    state.apply(&first).unwrap();
    state.apply(&second).unwrap();
    let action = &state.actions[&action_id];
    assert_eq!(action.status, ActionStatus::HumanApproved);
    assert_eq!(action.approved_by.as_deref(), Some("human:alice"));
}
