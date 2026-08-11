//! Evolution Governor roadmap state and guarded tier transitions.

use super::state::{self, RoadmapItem, RoadmapItemAction, RoadmapPriority, RoadmapTier};
use anyhow::{bail, Result};
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

const MAX_NOW_ITEMS: usize = 2;

#[derive(Debug, Clone, Copy, clap::ValueEnum)]
pub enum ProposalTier {
    Next,
    Later,
}

impl From<ProposalTier> for RoadmapTier {
    fn from(value: ProposalTier) -> Self {
        match value {
            ProposalTier::Next => Self::Next,
            ProposalTier::Later => Self::Later,
        }
    }
}

#[derive(Debug)]
pub struct NewRoadmapItem {
    pub tier: ProposalTier,
    pub action: RoadmapItemAction,
    pub priority: RoadmapPriority,
    pub objective: String,
    pub evidence: String,
    pub scope: String,
    pub out_of_scope: String,
    pub dependencies: String,
    pub risks: String,
    pub deliverables: String,
    pub owner: String,
    pub reviewer: String,
    pub acceptance_criteria: String,
    pub exit_criteria: String,
    pub definition_of_done: String,
    pub rollback_path: String,
}

#[derive(Debug, Serialize)]
pub struct RoadmapView {
    pub now: Vec<RoadmapItem>,
    pub next: Vec<RoadmapItem>,
    pub later: Vec<RoadmapItem>,
}

pub fn list(root: &Path) -> Result<RoadmapView> {
    let mut items = state::load(root)?.roadmap;
    items.sort_by_key(|item| priority_rank(item.priority));
    Ok(RoadmapView {
        now: items
            .iter()
            .filter(|item| item.tier == RoadmapTier::Now)
            .cloned()
            .collect(),
        next: items
            .iter()
            .filter(|item| item.tier == RoadmapTier::Next)
            .cloned()
            .collect(),
        later: items
            .into_iter()
            .filter(|item| item.tier == RoadmapTier::Later)
            .collect(),
    })
}

pub fn add(root: &Path, input: NewRoadmapItem) -> Result<RoadmapItem> {
    let objective = required("objective", input.objective)?;
    let evidence = required("evidence", input.evidence)?;
    let scope = required("scope", input.scope)?;
    let out_of_scope = required("out-of-scope", input.out_of_scope)?;
    let dependencies = required("dependencies", input.dependencies)?;
    let risks = required("risks", input.risks)?;
    let deliverables = required("deliverables", input.deliverables)?;
    let owner = required("owner", input.owner)?;
    let reviewer = required("reviewer", input.reviewer)?;
    let acceptance_criteria = required("acceptance-criteria", input.acceptance_criteria)?;
    let exit_criteria = required("exit-criteria", input.exit_criteria)?;
    let definition_of_done = required("definition-of-done", input.definition_of_done)?;
    let rollback_path = required("rollback-path", input.rollback_path)?;

    state::mutate(root, |state| {
        let now = state::now();
        let item = RoadmapItem {
            id: Uuid::new_v4().to_string(),
            tier: input.tier.into(),
            action: input.action,
            priority: input.priority,
            objective,
            evidence,
            scope,
            out_of_scope,
            dependencies,
            risks,
            deliverables,
            owner,
            reviewer,
            acceptance_criteria,
            exit_criteria,
            definition_of_done,
            rollback_path,
            created_at: now.clone(),
            updated_at: now,
        };
        state.roadmap.push(item.clone());
        Ok(item)
    })
}

pub fn promote(root: &Path, id: &str, approved: bool) -> Result<RoadmapItem> {
    if !approved {
        bail!(
            "promoting NEXT -> NOW requires --approve in this exact invocation; no state was changed"
        );
    }
    state::mutate(root, |state| {
        let item_index = state
            .roadmap
            .iter()
            .position(|item| item.id == id)
            .ok_or_else(|| anyhow::anyhow!("unknown roadmap item id '{id}'"))?;
        if state.roadmap[item_index].tier != RoadmapTier::Next {
            bail!(
                "roadmap item {id} is {}; only NEXT items can be promoted to NOW",
                state.roadmap[item_index].tier.as_str()
            );
        }
        let now_count = state
            .roadmap
            .iter()
            .filter(|item| item.tier == RoadmapTier::Now)
            .count();
        if now_count >= MAX_NOW_ITEMS {
            bail!(
                "NOW already contains {now_count} items (maximum {MAX_NOW_ITEMS}); demote or complete an existing NOW item before promotion"
            );
        }
        let item = &mut state.roadmap[item_index];
        item.tier = RoadmapTier::Now;
        item.updated_at = state::now();
        Ok(item.clone())
    })
}

pub fn demote(root: &Path, id: &str) -> Result<RoadmapItem> {
    state::mutate(root, |state| {
        let item = state
            .roadmap
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| anyhow::anyhow!("unknown roadmap item id '{id}'"))?;
        if item.tier == RoadmapTier::Later {
            bail!("roadmap item {id} is already LATER");
        }
        item.tier = RoadmapTier::Later;
        item.updated_at = state::now();
        Ok(item.clone())
    })
}

pub fn print_view(view: &RoadmapView, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(view)?);
        return Ok(());
    }
    print_tier("NOW", &view.now);
    print_tier("NEXT", &view.next);
    print_tier("LATER", &view.later);
    Ok(())
}

pub fn print_item(item: &RoadmapItem, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(item)?);
    } else {
        println!(
            "{}  {}  {}  {}  {}",
            item.id,
            item.tier.as_str(),
            item.priority.as_str(),
            item.action.as_str(),
            item.objective
        );
    }
    Ok(())
}

fn print_tier(label: &str, items: &[RoadmapItem]) {
    println!("{label}  ({})", items.len());
    println!("{}", "─".repeat(82));
    if items.is_empty() {
        println!("  —");
    } else {
        for item in items {
            println!(
                "  {}  {}  {:<11} {}",
                item.id.chars().take(8).collect::<String>(),
                item.priority.as_str(),
                item.action.as_str(),
                item.objective
            );
        }
    }
    println!();
}

fn required(label: &str, value: String) -> Result<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        bail!("{label} must not be empty");
    }
    Ok(value)
}

fn priority_rank(priority: RoadmapPriority) -> u8 {
    match priority {
        RoadmapPriority::P0 => 0,
        RoadmapPriority::P1 => 1,
        RoadmapPriority::P2 => 2,
        RoadmapPriority::P3 => 3,
        RoadmapPriority::P4 => 4,
        RoadmapPriority::P5 => 5,
        RoadmapPriority::P6 => 6,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-governor-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(&root).unwrap();
        root
    }

    fn proposal(objective: &str) -> NewRoadmapItem {
        NewRoadmapItem {
            tier: ProposalTier::Next,
            action: RoadmapItemAction::Stabilize,
            priority: RoadmapPriority::P1,
            objective: objective.into(),
            evidence: "verified failing golden path".into(),
            scope: "runtime integration".into(),
            out_of_scope: "new providers".into(),
            dependencies: "capability runtime".into(),
            risks: "regression".into(),
            deliverables: "passing vertical slice".into(),
            owner: "runtime maintainer".into(),
            reviewer: "anh".into(),
            acceptance_criteria: "golden path passes".into(),
            exit_criteria: "evidence is recorded".into(),
            definition_of_done: "tests and docs pass".into(),
            rollback_path: "remove the integration wiring".into(),
        }
    }

    #[test]
    fn promotion_without_approval_is_rejected_and_unchanged() {
        let root = root();
        let item = add(&root, proposal("approval gate")).unwrap();

        let error = promote(&root, &item.id, false).unwrap_err().to_string();

        assert!(error.contains("requires --approve"));
        let stored = state::load(&root).unwrap();
        assert_eq!(stored.roadmap[0].tier, RoadmapTier::Next);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn promotion_fails_closed_when_now_is_full() {
        let root = root();
        let first = add(&root, proposal("first")).unwrap();
        let second = add(&root, proposal("second")).unwrap();
        let third = add(&root, proposal("third")).unwrap();
        promote(&root, &first.id, true).unwrap();
        promote(&root, &second.id, true).unwrap();

        let error = promote(&root, &third.id, true).unwrap_err().to_string();

        assert!(error.contains("maximum 2"));
        let stored = state::load(&root).unwrap();
        assert_eq!(
            stored
                .roadmap
                .iter()
                .find(|item| item.id == third.id)
                .unwrap()
                .tier,
            RoadmapTier::Next
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approved_promotion_succeeds_with_available_capacity() {
        let root = root();
        let first = add(&root, proposal("first")).unwrap();
        let second = add(&root, proposal("second")).unwrap();

        assert_eq!(
            promote(&root, &first.id, true).unwrap().tier,
            RoadmapTier::Now
        );
        assert_eq!(
            promote(&root, &second.id, true).unwrap().tier,
            RoadmapTier::Now
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_required_field_is_rejected_without_persistence() {
        let root = root();
        let mut input = proposal("incomplete");
        input.acceptance_criteria = "  ".into();

        let error = add(&root, input).unwrap_err().to_string();

        assert!(error.contains("acceptance-criteria must not be empty"));
        assert!(state::load(&root).unwrap().roadmap.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn demotion_to_later_needs_no_approval() {
        let root = root();
        let item = add(&root, proposal("safe demotion")).unwrap();
        promote(&root, &item.id, true).unwrap();

        let demoted = demote(&root, &item.id).unwrap();

        assert_eq!(demoted.tier, RoadmapTier::Later);
        assert_eq!(
            state::load(&root).unwrap().roadmap[0].tier,
            RoadmapTier::Later
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_state_file_is_rejected_without_touching_target() {
        use std::os::unix::fs::symlink;

        let root = root();
        let state_path = state::state_path(&root);
        let outside = std::env::temp_dir().join(format!("yana-governor-target-{}", Uuid::new_v4()));
        fs::write(&outside, "do not replace").unwrap();
        fs::remove_file(&state_path).unwrap();
        symlink(&outside, &state_path).unwrap();

        assert!(add(&root, proposal("symlink attack")).is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "do not replace");
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(outside).unwrap();
    }
}
