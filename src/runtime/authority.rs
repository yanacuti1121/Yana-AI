use super::TurnContext;
use crate::capability::lease::LeaseStore;
use crate::capability::{manifest, ApprovalRequirement};
use crate::model::tool::ToolCall;

/// `command.execute`'s only argument today (`{"command": "..."}`) — the one
/// capability whose invocation a lease can currently be scoped by content,
/// not just by capability name. Returns `None` for every other capability,
/// which makes a lease for them subject/capability/scope-only (no command
/// text to match against).
fn command_text_for_lease(call: &ToolCall) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct Args {
        command: Option<String>,
    }
    serde_json::from_str::<Args>(&call.arguments_json)
        .ok()
        .and_then(|args| args.command)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AuthorityLayer {
    GiamThi,
    YanaControlPlane,
}

impl AuthorityLayer {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::GiamThi => "giam_thi",
            Self::YanaControlPlane => "yana_control_plane",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityDecision {
    /// `decision_id` correlates this Allow to the `AuthorityDecisionReceipt`
    /// recorded for it (item #3) and, in turn, to the `ExecutionReceipt`
    /// (item #4) an actual capability invocation emits — the
    /// `AuthorityDecision → Invocation → ExecutionReceipt` link in the
    /// causal chain `Turn → Proposal → AuthorityDecision → Invocation →
    /// ExecutionReceipt → Result`. `None` only for `preflight_turn`'s own
    /// turn-level HALT-gate Allow (not a per-capability decision, so
    /// nothing is recorded for it — see that function).
    Allow { decision_id: Option<String> },
    HumanApprovalRequired {
        authority: AuthorityLayer,
        reason: String,
    },
    Deny {
        authority: AuthorityLayer,
        reason: String,
    },
}

pub(crate) trait RuntimeAuthority: Send + Sync {
    fn preflight_turn(&self, context: &TurnContext) -> AuthorityDecision;
    fn authorize_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision;
    fn authorize_approved_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision;
}

#[derive(Debug, Default)]
pub(crate) struct YanaAuthorityChain;

impl RuntimeAuthority for YanaAuthorityChain {
    fn preflight_turn(&self, context: &TurnContext) -> AuthorityDecision {
        let root = &context.session.repo_root;
        if crate::os::halt_is_active(root) {
            AuthorityDecision::Deny {
                authority: AuthorityLayer::GiamThi,
                reason: format!(
                    "Giám Thị HALT is active or cannot be proven absent under {}",
                    root.display()
                ),
            }
        } else {
            // No decision_id: this is a turn-level gate check, not a
            // per-capability decision, so nothing is recorded for it — see
            // `AuthorityDecision::Allow`'s own doc comment.
            AuthorityDecision::Allow { decision_id: None }
        }
    }

    fn authorize_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision {
        self.capability_decision(context, call, false)
    }

    fn authorize_approved_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision {
        self.capability_decision(context, call, true)
    }
}

impl YanaAuthorityChain {
    fn capability_decision(
        &self,
        context: &TurnContext,
        call: &ToolCall,
        human_approved: bool,
    ) -> AuthorityDecision {
        if let decision @ AuthorityDecision::Deny { .. } = self.preflight_turn(context) {
            let decision_id = uuid::Uuid::new_v4().to_string();
            super::receipt::record(&decision_id, context, &call.name, &decision, None);
            return decision;
        }

        let registry = manifest();
        let Some(descriptor) = registry.get_by_tool_name(&call.name) else {
            let decision_id = uuid::Uuid::new_v4().to_string();
            let decision = AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!("tool '{}' has no canonical Yana capability", call.name),
            };
            super::receipt::record(&decision_id, context, &call.name, &decision, None);
            return decision;
        };
        if !(descriptor.availability)(&context.session) {
            let decision_id = uuid::Uuid::new_v4().to_string();
            let decision = AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "capability '{}' is unavailable in this session",
                    descriptor.name
                ),
            };
            super::receipt::record(&decision_id, context, descriptor.name, &decision, None);
            return decision;
        }

        // Capability Lease (Milestone "Authority Depth", P0): a lease is
        // evidence supplied to authority, never a cached authority
        // decision — `try_consume_matching` re-checks subject, capability,
        // scope, expiry, revocation, and budget against what's on disk
        // right now, every single call. It runs after the HALT check above
        // (via `preflight_turn`, already evaluated at the top of this
        // function) and the availability check above it, so a lease can
        // never bypass either. A matching lease *does* satisfy the
        // human_initiated gate below — that's the actual point of a lease:
        // letting a delegated subagent run within a human-granted,
        // time-boxed, budget-boxed scope without a live human clicking
        // every call.
        if descriptor.approval == ApprovalRequirement::HumanApprovalPerCall {
            if let Some(subject) = context.agent_id.as_deref().filter(|s| !s.is_empty()) {
                let command_text = command_text_for_lease(call);
                let matched_lease_id = LeaseStore::for_root(&context.session.repo_root)
                    .try_consume_matching(
                        subject,
                        descriptor.name,
                        &context.session.repo_root,
                        command_text.as_deref(),
                    )
                    .unwrap_or(None);
                if let Some(lease_id) = matched_lease_id {
                    let decision_id = uuid::Uuid::new_v4().to_string();
                    let decision = AuthorityDecision::Allow {
                        decision_id: Some(decision_id.clone()),
                    };
                    super::receipt::record(
                        &decision_id,
                        context,
                        descriptor.name,
                        &decision,
                        Some(lease_id),
                    );
                    return decision;
                }
            }
        }

        if descriptor.approval == ApprovalRequirement::HumanApprovalPerCall
            && !context.human_initiated
        {
            let decision_id = uuid::Uuid::new_v4().to_string();
            let decision = AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "non-human-initiated {:?} turn cannot execute capability '{}'",
                    context.origin, descriptor.name
                ),
            };
            super::receipt::record(&decision_id, context, descriptor.name, &decision, None);
            return decision;
        }

        let decision_id = uuid::Uuid::new_v4().to_string();
        let decision = match descriptor.approval {
            ApprovalRequirement::None => AuthorityDecision::Allow {
                decision_id: Some(decision_id.clone()),
            },
            ApprovalRequirement::HumanApprovalPerCall if human_approved => {
                AuthorityDecision::Allow {
                    decision_id: Some(decision_id.clone()),
                }
            }
            ApprovalRequirement::HumanApprovalPerCall => AuthorityDecision::HumanApprovalRequired {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "capability '{}' requires explicit human approval",
                    descriptor.name
                ),
            },
        };
        super::receipt::record(&decision_id, context, descriptor.name, &decision, None);
        decision
    }
}
