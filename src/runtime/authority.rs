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

/// Authority Hardening item #7 (Intent Contract foundation, `ADR-015`).
///
/// A model's (or a dispatched subagent's) own declared intent for a
/// bounded task. **Untrusted by construction**: [`narrow_by_intent`] is
/// the only place this type is consulted, and it can only ever shrink an
/// `Allow` the other four real checks (HALT, registry availability,
/// lease/human-approval, policy) already produced into a
/// `HumanApprovalRequired` — it can never widen a `Deny` or an already-
/// required approval into an `Allow`, and it never grants anything by
/// itself. This mirrors `capability::lease`'s own
/// `try_consume_matching` AND-composition exactly: safety by
/// intersection with what was already permitted, never by trusting a
/// self-reported list on its own.
///
/// `EffectiveExecutionEnvelope = ModelRequested ∩ HumanGranted ∩
/// DelegatedAuthority ∩ PolicyAllowed ∩ RuntimeCapabilityAvailability` —
/// this struct *is* `ModelRequested`, the one term of that formula with
/// no existing primitive before this. The other four are already real,
/// enforced checks earlier in `capability_decision` (lease/human-approval,
/// the delegation chain a lease's ancestors walk, `ApprovalRequirement`,
/// and `descriptor.availability`) — narrowing by intent runs *after* all
/// four already agreed to `Allow`, exactly matching the formula's
/// intersection order.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct IntentDeclaration {
    /// Canonical capability names this task declares it will use.
    /// Anything else defaults out-of-envelope — an empty list means "no
    /// capability at all was declared," not "everything is allowed."
    pub declared_capabilities: Vec<String>,
    /// Command-scope entries (same token-prefix matching as a lease's own
    /// `allow` list — reuses `capability::lease`'s exact matcher, not a
    /// second parser). Empty means "not scope-restricted, only
    /// capability-restricted": a declared capability with no scope
    /// entries is in-envelope for any command under that capability.
    pub declared_scope: Vec<String>,
    /// Free text, logged for audit, never itself a justification for
    /// widening anything.
    pub declared_reason: String,
}

/// Applies `context`'s declared intent (if any) to an `Allow` the other
/// checks already produced. A capability not in `declared_capabilities`,
/// or a command not matching any `declared_scope` entry (when the
/// declaration has scope entries for that capability), downgrades the
/// decision to `HumanApprovalRequired` — a pause/renegotiate signal, per
/// `ADR-015`'s own design ("If the model needs something it forgot to
/// declare mid-task, that's a pause/renegotiate, not a silent
/// escalation"), never a silent `Deny` dead-end and never left as
/// `Allow`. Passes every other `AuthorityDecision` variant through
/// unchanged — `Deny`/`HumanApprovalRequired` are already at least as
/// restrictive as anything this function could produce.
fn narrow_by_intent(
    context: &TurnContext,
    capability: &str,
    command_text: Option<&str>,
    decision: AuthorityDecision,
) -> AuthorityDecision {
    let AuthorityDecision::Allow { .. } = &decision else {
        return decision;
    };
    let Some(intent) = &context.intent else {
        return decision;
    };
    if !intent
        .declared_capabilities
        .iter()
        .any(|declared| declared == capability)
    {
        return AuthorityDecision::HumanApprovalRequired {
            authority: AuthorityLayer::YanaControlPlane,
            reason: format!(
                "capability '{capability}' was not declared in this task's intent ({}); requires a new human decision",
                intent.declared_reason
            ),
        };
    }
    if !intent.declared_scope.is_empty() {
        let in_scope = match command_text {
            Some(text) => intent
                .declared_scope
                .iter()
                .any(|entry| crate::capability::lease::command_matches(entry, text)),
            None => false,
        };
        if !in_scope {
            return AuthorityDecision::HumanApprovalRequired {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "command is outside this task's declared intent scope ({}); requires a new human decision",
                    intent.declared_reason
                ),
            };
        }
    }
    decision
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

        let command_text = command_text_for_lease(call);

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
                    let decision = narrow_by_intent(
                        context,
                        descriptor.name,
                        command_text.as_deref(),
                        AuthorityDecision::Allow {
                            decision_id: Some(decision_id.clone()),
                        },
                    );
                    let lease_id_for_receipt =
                        matches!(decision, AuthorityDecision::Allow { .. }).then_some(lease_id);
                    super::receipt::record(
                        &decision_id,
                        context,
                        descriptor.name,
                        &decision,
                        lease_id_for_receipt,
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
        let decision = narrow_by_intent(context, descriptor.name, command_text.as_deref(), decision);
        super::receipt::record(&decision_id, context, descriptor.name, &decision, None);
        decision
    }
}
