//! macOS process isolation via `sandbox-exec` (Phase 10 of the
//! host-native-os program).
//!
//! `sandbox-exec` is deprecated by Apple (`man sandbox-exec`: "Developers
//! who wish to sandbox an app should instead adopt the App Sandbox
//! feature") but remains present and functional as of this macOS
//! version, is a plain system binary (no new dependency), and is the
//! only native containment mechanism reachable via shell-out —
//! `platform::macos::profile.rs` already reported
//! `process_containment: Support::Supported` on that basis (Phase 3),
//! this file is what makes that claim concretely true.
//!
//! Both rule kinds below were verified live against real `sandbox-exec`
//! on this machine before being encoded here, not assumed from
//! documentation:
//!   - `(deny network*)` genuinely blocks outbound connections (tested:
//!     `curl` to a real host failed to resolve under the profile).
//!   - `(deny file-write*)` followed by `(allow file-write* (subpath
//!     ...))` genuinely confines writes to the allowed subpath (tested:
//!     a write inside the allowed path succeeded, a write outside it
//!     failed with "Operation not permitted") — SBPL's last-matching-rule
//!     -wins semantics for the same operation category, confirmed
//!     empirically, not assumed.

#[cfg(target_os = "macos")]
use super::super::capabilities::Support;
#[cfg(target_os = "macos")]
use super::super::contract::IsolationBackend;
#[cfg(any(test, target_os = "macos"))]
use super::super::contract::IsolationPlan;
#[cfg(target_os = "macos")]
use anyhow::{bail, Result};

#[cfg(target_os = "macos")]
const SANDBOX_EXEC_PATH: &str = "/usr/bin/sandbox-exec";

#[cfg(target_os = "macos")]
pub struct Backend;

#[cfg(target_os = "macos")]
impl IsolationBackend for Backend {
    fn is_available(&self) -> Support {
        if std::path::Path::new(SANDBOX_EXEC_PATH).is_file() {
            Support::Supported
        } else {
            Support::Unsupported
        }
    }

    fn wrap(&self, plan: &IsolationPlan, argv: &[String]) -> Result<Vec<String>> {
        if argv.is_empty() {
            bail!("cannot isolate an empty argv");
        }
        let profile = build_profile(plan);
        let mut wrapped = vec![SANDBOX_EXEC_PATH.to_string(), "-p".to_string(), profile];
        wrapped.extend(argv.iter().cloned());
        Ok(wrapped)
    }
}

#[cfg(any(test, target_os = "macos"))]
fn build_profile(plan: &IsolationPlan) -> String {
    let mut rules = vec!["(version 1)".to_string(), "(allow default)".to_string()];
    if plan.deny_network {
        rules.push("(deny network*)".to_string());
    }
    if !plan.write_allowed_paths.is_empty() {
        rules.push("(deny file-write*)".to_string());
        for path in &plan.write_allowed_paths {
            rules.push(format!(
                "(allow file-write* (subpath {}))",
                sbpl_string_literal(&path.display().to_string())
            ));
        }
    }
    rules.join("")
}

/// SBPL string literals follow C/Scheme-style escaping. Every embedded
/// backslash or double quote in `value` is escaped so a crafted path
/// cannot close the literal early and inject additional profile rules —
/// the same class of defense as this codebase's existing
/// `xml_escape`/`systemd_escape` helpers for their respective injection
/// surfaces (`service::manager`), applied to SBPL's surface instead.
#[cfg(any(test, target_os = "macos"))]
fn sbpl_string_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn baseline_profile_allows_by_default() {
        let profile = build_profile(&IsolationPlan::default());
        assert_eq!(profile, "(version 1)(allow default)");
    }

    #[test]
    fn deny_network_adds_the_verified_network_deny_rule() {
        let plan = IsolationPlan {
            deny_network: true,
            write_allowed_paths: Vec::new(),
        };
        let profile = build_profile(&plan);
        assert!(profile.contains("(deny network*)"));
    }

    #[test]
    fn write_allowed_paths_deny_first_then_narrow_allow() {
        let plan = IsolationPlan {
            deny_network: false,
            write_allowed_paths: vec![PathBuf::from("/tmp/allowed")],
        };
        let profile = build_profile(&plan);
        let deny_pos = profile.find("(deny file-write*)").unwrap();
        let allow_pos = profile.find("(allow file-write*").unwrap();
        // SBPL is last-rule-wins per operation category -- the deny must
        // come before the narrower allow, or the allow would have no
        // effect (verified live: this exact ordering is what worked).
        assert!(deny_pos < allow_pos);
        assert!(profile.contains("(subpath \"/tmp/allowed\")"));
    }

    #[test]
    fn quotes_and_backslashes_in_a_path_cannot_break_out_of_the_literal() {
        // Live-verified against real sandbox-exec on this machine (not
        // just asserted here): escaping this exact string this way and
        // building a "deny file-write* / allow within the escaped path"
        // profile correctly denies a write OUTSIDE the malicious literal
        // path — proving the parser treats it as one opaque string, never
        // as injected rules. See this file's module doc for the
        // methodology. This unit test checks the escaping property that
        // makes that true: every quote inside the literal is escaped.
        let malicious = "/tmp/x\") (allow file-write* (subpath \"/";
        let literal = sbpl_string_literal(malicious);
        let inner: Vec<char> = literal[1..literal.len() - 1].chars().collect();
        for (index, ch) in inner.iter().enumerate() {
            if *ch == '"' {
                assert_eq!(
                    inner[index - 1],
                    '\\',
                    "unescaped quote at position {index} in {inner:?}"
                );
            }
        }
    }

    // The two tests below exercise the real `Backend`/`IsolationBackend`
    // impl, which only exists under `target_os = "macos"` (unlike
    // `build_profile`/`sbpl_string_literal` above, which are pure and
    // compiled under `any(test, target_os = "macos")` so they run on any
    // CI host) -- gated so this file still compiles its test module on
    // non-macOS hosts.

    #[cfg(target_os = "macos")]
    #[test]
    fn wrap_prefixes_sandbox_exec_with_the_profile_and_preserves_original_argv() {
        let backend = Backend;
        let plan = IsolationPlan {
            deny_network: true,
            write_allowed_paths: Vec::new(),
        };
        let wrapped = backend
            .wrap(&plan, &["/bin/echo".to_string(), "hi".to_string()])
            .unwrap();
        assert_eq!(wrapped[0], SANDBOX_EXEC_PATH);
        assert_eq!(wrapped[1], "-p");
        assert!(wrapped[2].contains("deny network"));
        assert_eq!(wrapped[3], "/bin/echo");
        assert_eq!(wrapped[4], "hi");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn wrap_rejects_an_empty_argv() {
        let backend = Backend;
        assert!(backend.wrap(&IsolationPlan::default(), &[]).is_err());
    }
}
