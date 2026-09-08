import React, { useEffect, useState } from "react";
import { Clock3, RefreshCw, Shield, ShieldOff, XCircle } from "lucide-react";
import type { Lease, PendingApprovalSummary } from "./types";

// Screen 4 "Permissions" — was chat-approval presentation only. Two real,
// distinct Rust stores (see host/permissions.cjs's own module doc): leases
// (revocable here) and pending approvals from ANY client, shown read-only
// — resolving one safely needs the exact turn context only the client that
// paused it holds, which this screen does not have.
export function Permissions({
  root,
  onError,
}: {
  root: string;
  onError: (message: string) => void;
}) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [approvals, setApprovals] = useState<PendingApprovalSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      onError(String(error));
    }
  };
  const refresh = () =>
    run(async () => {
      const [nextLeases, nextApprovals] = await Promise.all([
        window.studio.leaseList(root),
        window.studio.pendingApprovals(root),
      ]);
      setLeases(nextLeases);
      setApprovals(nextApprovals);
    });
  useEffect(() => {
    setLeases([]);
    setApprovals([]);
    if (root) void refresh();
  }, [root]);

  const revoke = (lease: Lease) =>
    run(async () => {
      await window.studio.leaseRevoke(root, lease.id);
      await refresh();
    });

  const leaseStatus = (lease: Lease) => {
    if (lease.revoked) return "revoked";
    if (new Date(lease.expires_at).getTime() <= Date.now()) return "expired";
    if (lease.remaining === 0) return "budget exhausted";
    return "active";
  };

  return (
    <div className="tasks-workspace">
      <div className="tasks-header">
        <div className="section-label">
          <Shield size={14} /> PERMISSIONS
        </div>
        <button
          title="Refresh"
          disabled={loading || !root}
          onClick={() =>
            void (async () => {
              setLoading(true);
              await refresh();
              setLoading(false);
            })()
          }
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {!root ? (
        <p className="empty-small">Open a project to see its permissions.</p>
      ) : (
        <>
          <div className="section-label">
            <Clock3 size={13} /> PENDING APPROVALS
          </div>
          {!approvals.length ? (
            <p className="empty-small">
              No pending approvals for this project — this list covers every
              client (Terminal, other yana-rt runs), not only this conversation.
            </p>
          ) : (
            <div className="task-list">
              {approvals.map((approval) => (
                <div className="task-row" key={approval.approval_id}>
                  <div className="task-status">
                    <Clock3 size={16} />
                  </div>
                  <div className="task-main">
                    <strong>{approval.pending_call.name}</strong>
                    <div className="task-meta">
                      <span>{approval.authority_reason}</span>
                    </div>
                    <div className="task-meta">
                      <span>
                        expires {new Date(approval.expires_at).toLocaleString()}
                      </span>
                      {approval.resolved && (
                        <span>
                          resolved: {approval.decision ? "allow" : "deny"} by{" "}
                          {approval.decided_by}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="section-label" style={{ marginTop: 10 }}>
            <ShieldOff size={13} /> LEASES
          </div>
          {!leases.length ? (
            <p className="empty-small">
              No capability leases for this project.
            </p>
          ) : (
            <div className="task-list">
              {leases.map((lease) => {
                const status = leaseStatus(lease);
                return (
                  <div
                    className={`task-row ${status !== "active" ? "done" : ""}`}
                    key={lease.id}
                  >
                    <div className="task-main">
                      <strong>
                        {lease.subject} → {lease.capability}
                      </strong>
                      <div className="task-meta">
                        <span>{status}</span>
                        <span>issued by {lease.issued_by}</span>
                        {lease.remaining !== null && (
                          <span>{lease.remaining} calls left</span>
                        )}
                        <span>
                          expires {new Date(lease.expires_at).toLocaleString()}
                        </span>
                      </div>
                      {lease.allow.length > 0 && (
                        <div className="task-dependencies">
                          <span>allow: {lease.allow.join(", ")}</span>
                        </div>
                      )}
                    </div>
                    <div className="task-actions">
                      {status === "active" && (
                        <button
                          title="Revoke lease"
                          onClick={() => void revoke(lease)}
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
