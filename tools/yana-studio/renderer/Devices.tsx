import React, { useEffect, useState } from "react";
import {
  Cpu,
  HardDrive,
  MonitorSmartphone,
  RefreshCw,
  Zap,
} from "lucide-react";
import type { HostProfile, Support } from "./types";

const supportLabel: Record<Support, string> = {
  supported: "Supported",
  unsupported: "Unsupported",
  unknown: "Unknown",
};
const CAPABILITY_LABELS: [keyof HostProfile["capabilities"], string][] = [
  ["native_service_manager", "Native service manager"],
  ["filesystem_events", "Filesystem change events"],
  ["secure_secret_storage", "OS-native secret storage"],
  ["process_containment", "Process containment"],
  ["native_notifications", "Native notifications"],
  ["accelerator_telemetry", "Accelerator telemetry"],
];

function bytes(value: number | null) {
  if (value === null) return "Unknown";
  const gib = value / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}

// Screen 3 "Devices" — was "Not implemented" in Studio, though the legacy
// Yana Desktop already had it via the same yana-rt os host status --json
// contract (src/os/platform/profile.rs::HostProfile). Host-level, not
// project-scoped; every field the runtime could not determine is shown as
// "Unknown", never guessed.
export function Devices({ onError }: { onError: (message: string) => void }) {
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = () => {
    setLoading(true);
    window.studio
      .hostStatus()
      .then(setProfile)
      .catch((error) => onError(String(error)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div className="tasks-workspace">
      <div className="tasks-header">
        <div className="section-label">
          <MonitorSmartphone size={14} /> DEVICES
        </div>
        <button title="Refresh" disabled={loading} onClick={refresh}>
          <RefreshCw size={14} />
        </button>
      </div>
      {!profile ? (
        <p className="empty-small">Reading host profile…</p>
      ) : (
        <>
          <div className="task-row card" style={{ alignItems: "center" }}>
            <div className="task-status">
              <MonitorSmartphone size={16} />
            </div>
            <div className="task-main">
              <strong>
                {profile.os} · {profile.arch}
              </strong>
              <div className="task-meta">
                <span>Schema v{profile.schema_version}</span>
              </div>
            </div>
          </div>
          <div className="task-row card" style={{ alignItems: "center" }}>
            <div className="task-status">
              <Cpu size={16} />
            </div>
            <div className="task-main">
              <strong>
                {profile.cpu.logical_cores} logical
                {profile.cpu.physical_cores
                  ? ` · ${profile.cpu.physical_cores} physical`
                  : ""}
              </strong>
              <div className="task-meta">
                <span>{profile.cpu.vendor || "Vendor unknown"}</span>
              </div>
            </div>
          </div>
          <div className="task-row card" style={{ alignItems: "center" }}>
            <div className="task-status">
              <HardDrive size={16} />
            </div>
            <div className="task-main">
              <strong>{bytes(profile.memory.total_bytes)}</strong>
              <div className="task-meta">
                <span>Model: {profile.memory.model}</span>
              </div>
            </div>
          </div>
          <div className="section-label">
            <Zap size={13} /> ACCELERATORS
          </div>
          {!profile.accelerators.length ? (
            <p className="empty-small">
              No accelerator detected (or not observable on this host).
            </p>
          ) : (
            <div className="task-list">
              {profile.accelerators.map((accelerator, index) => (
                <div className="task-row" key={index}>
                  <div className="task-main">
                    <strong>{accelerator.name}</strong>
                    <div className="task-meta">
                      <span>{accelerator.kind}</span>
                      {accelerator.backend && (
                        <span>{accelerator.backend}</span>
                      )}
                      <span>{accelerator.memory_model} memory</span>
                      {accelerator.dedicated_memory_bytes !== null && (
                        <span>{bytes(accelerator.dedicated_memory_bytes)}</span>
                      )}
                      <span>
                        telemetry: {supportLabel[accelerator.telemetry]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="section-label">PLATFORM CAPABILITIES</div>
          <div className="task-list">
            {CAPABILITY_LABELS.map(([key, label]) => (
              <div className="task-row" key={key}>
                <div className="task-main">
                  <strong>{label}</strong>
                </div>
                <div className="task-meta">
                  <span>{supportLabel[profile.capabilities[key]]}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
