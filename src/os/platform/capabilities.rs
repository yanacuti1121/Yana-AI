//! Normalized platform capability types.
//!
//! Working rule for this whole module tree: never equate UNKNOWN with
//! FALSE. A platform backend that cannot reliably determine whether a
//! mechanism is available must say so explicitly (`Support::Unknown`),
//! not silently report `Unsupported` — those mean different things to a
//! caller deciding whether to rely on the mechanism versus whether to
//! probe further.

use serde::{Deserialize, Serialize};

/// Tri-state support flag. A platform backend can truthfully say yes, no,
/// or "I don't know" — collapsing the third case into either of the first
/// two is exactly the kind of fabricated certainty this program's own
/// working rule forbids.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Support {
    Supported,
    Unsupported,
    Unknown,
}

impl Support {
    pub fn is_supported(self) -> bool {
        matches!(self, Support::Supported)
    }
}

/// Normalized, host-independent view of which native mechanisms this
/// platform backend can offer. Populated by `TelemetryBackend::host_profile`
/// (or a dedicated capability probe once one exists) — never hand-authored
/// per call site, so every consumer sees the same truthful picture.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformCapabilities {
    /// launchd / systemd-user / Task Scheduler — see `service::manager`.
    pub native_service_manager: Support,
    /// Native filesystem-change notification (FSEvents / inotify / ReadDirectoryChangesW).
    pub filesystem_events: Support,
    /// OS-native secret storage (Keychain / Secret Service / Credential Manager).
    pub secure_secret_storage: Support,
    /// Native process containment (sandbox-exec / cgroups+namespaces / Job Objects).
    pub process_containment: Support,
    /// Host-native user notifications.
    pub native_notifications: Support,
    /// Accelerator (GPU/NPU) utilization/memory telemetry, not just inventory.
    pub accelerator_telemetry: Support,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_supported_is_true_only_for_the_supported_variant() {
        assert!(Support::Supported.is_supported());
        assert!(!Support::Unsupported.is_supported());
        assert!(!Support::Unknown.is_supported());
    }

    #[test]
    fn unknown_serializes_as_its_own_distinct_value_not_false() {
        // The whole point of a tri-state type: an `Unknown` capability must
        // never round-trip through JSON as a boolean `false` — a consumer
        // reading raw JSON (a future desktop/TUI client, for instance)
        // needs to see the third state, not have it silently disappear.
        let value = serde_json::to_value(Support::Unknown).unwrap();
        assert_eq!(value, serde_json::json!("unknown"));
        assert_ne!(value, serde_json::json!(false));
    }

    #[test]
    fn capabilities_round_trip_through_json() {
        let capabilities = PlatformCapabilities {
            native_service_manager: Support::Supported,
            filesystem_events: Support::Unknown,
            secure_secret_storage: Support::Unsupported,
            process_containment: Support::Unknown,
            native_notifications: Support::Supported,
            accelerator_telemetry: Support::Unknown,
        };
        let text = serde_json::to_string(&capabilities).unwrap();
        let round_tripped: PlatformCapabilities = serde_json::from_str(&text).unwrap();
        assert_eq!(round_tripped.filesystem_events, Support::Unknown);
        assert_eq!(round_tripped.secure_secret_storage, Support::Unsupported);
    }
}
