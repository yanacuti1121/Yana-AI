use super::TurnContext;
use crate::capability::{manifest, ApprovalRequirement};
use crate::model::tool::ToolCall;

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
    Allow,
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
            AuthorityDecision::Allow
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
            return decision;
        }

        let registry = manifest();
        let Some(descriptor) = registry.get_by_tool_name(&call.name) else {
            return AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!("tool '{}' has no canonical Yana capability", call.name),
            };
        };
        if !(descriptor.availability)(&context.session) {
            return AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "capability '{}' is unavailable in this session",
                    descriptor.name
                ),
            };
        }

        if descriptor.approval == ApprovalRequirement::HumanApprovalPerCall
            && !context.human_initiated
        {
            return AuthorityDecision::Deny {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "non-human-initiated {:?} turn cannot execute capability '{}'",
                    context.origin, descriptor.name
                ),
            };
        }

        match descriptor.approval {
            ApprovalRequirement::None => AuthorityDecision::Allow,
            ApprovalRequirement::HumanApprovalPerCall if human_approved => AuthorityDecision::Allow,
            ApprovalRequirement::HumanApprovalPerCall => AuthorityDecision::HumanApprovalRequired {
                authority: AuthorityLayer::YanaControlPlane,
                reason: format!(
                    "capability '{}' requires explicit human approval",
                    descriptor.name
                ),
            },
        }
    }
}
