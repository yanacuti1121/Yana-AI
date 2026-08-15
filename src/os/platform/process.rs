//! Process execution plan assembly (Phase 10 of the host-native-os
//! program).
//!
//! Implements this program's own architecture literally: Agent/model
//! request → Capability → Policy decision → `ExecutionPlan` → native
//! `ProcessBackend`/`IsolationBackend`. `build_plan()` is the
//! "ExecutionPlan" step: it takes a `ProcessSpec` (an ALREADY-AUTHORIZED
//! argv + owner — this module never decides whether it was authorized)
//! and, if isolation was requested, asks an `IsolationBackend` to
//! transform the argv into an isolated one. `spawn_plan()` then executes
//! it via `os::service::attribution::spawn()` — this program's existing,
//! tested governed-spawn implementation, reused rather than duplicated.

use super::contract::{IsolationBackend, IsolationPlan};
use crate::os::service::attribution::{self, GovernedChild, ProcessAttribution};
use anyhow::{bail, Result};
use std::path::Path;

/// An already-authorized request to run something. Building one of these
/// IS the authorization decision; nothing downstream of it re-checks
/// authorization.
pub struct ProcessSpec {
    pub argv: Vec<String>,
    pub owner: ProcessAttribution,
}

/// Requests isolation for a `ProcessSpec`. `required: true` means fail
/// closed if the backend turns out to be unavailable — matching this
/// program's own "fail closed for safety-critical uncertainty" DNA — as
/// opposed to silently running unisolated when isolation was assumed.
pub struct IsolationRequest<'a> {
    pub backend: &'a dyn IsolationBackend,
    pub plan: &'a IsolationPlan,
    pub required: bool,
}

pub struct ExecutionPlan {
    pub argv: Vec<String>,
    pub owner: ProcessAttribution,
    pub isolated: bool,
}

pub fn build_plan(spec: ProcessSpec, isolation: Option<IsolationRequest>) -> Result<ExecutionPlan> {
    let Some(request) = isolation else {
        return Ok(ExecutionPlan {
            argv: spec.argv,
            owner: spec.owner,
            isolated: false,
        });
    };
    if !request.backend.is_available().is_supported() {
        if request.required {
            bail!("isolation was required but no isolation backend is available on this host");
        }
        return Ok(ExecutionPlan {
            argv: spec.argv,
            owner: spec.owner,
            isolated: false,
        });
    }
    let argv = request.backend.wrap(request.plan, &spec.argv)?;
    Ok(ExecutionPlan {
        argv,
        owner: spec.owner,
        isolated: true,
    })
}

pub fn spawn_plan(root: &Path, plan: ExecutionPlan) -> Result<GovernedChild> {
    attribution::spawn(root, &plan.argv, plan.owner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::platform::capabilities::Support;

    fn spec() -> ProcessSpec {
        ProcessSpec {
            argv: vec!["/bin/echo".into(), "hello".into()],
            owner: ProcessAttribution {
                agent_id: "test-agent".into(),
                session_id: None,
                mission_id: None,
            },
        }
    }

    struct FakeBackend {
        available: bool,
    }

    impl IsolationBackend for FakeBackend {
        fn is_available(&self) -> Support {
            if self.available {
                Support::Supported
            } else {
                Support::Unsupported
            }
        }
        fn wrap(&self, _plan: &IsolationPlan, argv: &[String]) -> Result<Vec<String>> {
            let mut wrapped = vec!["/usr/bin/fake-sandbox".to_string()];
            wrapped.extend(argv.iter().cloned());
            Ok(wrapped)
        }
    }

    #[test]
    fn no_isolation_request_leaves_argv_untouched() {
        let plan = build_plan(spec(), None).unwrap();
        assert_eq!(plan.argv, vec!["/bin/echo", "hello"]);
        assert!(!plan.isolated);
    }

    #[test]
    fn available_backend_wraps_argv_and_marks_isolated() {
        let backend = FakeBackend { available: true };
        let isolation_plan = IsolationPlan::default();
        let request = IsolationRequest {
            backend: &backend,
            plan: &isolation_plan,
            required: false,
        };
        let plan = build_plan(spec(), Some(request)).unwrap();
        assert_eq!(plan.argv[0], "/usr/bin/fake-sandbox");
        assert!(plan.isolated);
    }

    #[test]
    fn unavailable_backend_falls_back_when_not_required() {
        let backend = FakeBackend { available: false };
        let isolation_plan = IsolationPlan::default();
        let request = IsolationRequest {
            backend: &backend,
            plan: &isolation_plan,
            required: false,
        };
        let plan = build_plan(spec(), Some(request)).unwrap();
        assert_eq!(plan.argv, vec!["/bin/echo", "hello"]);
        assert!(!plan.isolated);
    }

    #[test]
    fn unavailable_backend_fails_closed_when_required() {
        let backend = FakeBackend { available: false };
        let isolation_plan = IsolationPlan::default();
        let request = IsolationRequest {
            backend: &backend,
            plan: &isolation_plan,
            required: true,
        };
        assert!(build_plan(spec(), Some(request)).is_err());
    }

    #[test]
    fn spawn_plan_reuses_the_existing_governed_spawn_implementation() {
        let root =
            std::env::temp_dir().join(format!("yana-platform-process-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let plan = ExecutionPlan {
            argv: vec!["/bin/echo".into(), "hi".into()],
            owner: ProcessAttribution {
                agent_id: "test-agent".into(),
                session_id: None,
                mission_id: None,
            },
            isolated: false,
        };
        let mut governed = spawn_plan(&root, plan).unwrap();
        assert!(governed.child.wait().unwrap().success());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
