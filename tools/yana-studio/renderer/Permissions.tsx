import React, { useEffect, useState } from "react";
import {
  Clock3,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldOff,
  XCircle,
} from "lucide-react";
import type { Lease, PendingApprovalSummary } from "./types";
import { translate, type Locale } from "./i18n";

// Screen 4 "Permissions" — was chat-approval presentation only. Two real,
// distinct Rust stores (see host/permissions.cjs's own module doc): leases
// (revocable here) and pending approvals from ANY client, shown read-only
// — resolving one safely needs the exact turn context only the client that
// paused it holds, which this screen does not have.
export function Permissions({
  root,
  locale,
  onError,
}: {
  root: string;
  locale: Locale;
  onError: (message: string) => void;
}) {
  const t = translate(locale);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [approvals, setApprovals] = useState<PendingApprovalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [subject, setSubject] = useState("agent:studio");
  const [capability, setCapability] = useState("");
  const [allow, setAllow] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState(30);
  const [invocationBudget, setInvocationBudget] = useState("");

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
  const grant = () =>
    run(async () => {
      await window.studio.leaseGrant(root, {
        subject,
        capability,
        allow: allow
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        expiresInMinutes,
        ...(invocationBudget.trim()
          ? { invocationBudget: Number(invocationBudget) }
          : {}),
      });
      setCapability("");
      setAllow("");
      setInvocationBudget("");
      setGrantOpen(false);
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
            <button
              title="Grant a scoped lease"
              onClick={() => setGrantOpen((value) => !value)}
            >
              <KeyRound size={13} /> Grant
            </button>
          </div>
          {grantOpen && (
            <div className="lease-grant-form">
              <p className="empty-small">{t("leaseGrantScopeNote")}</p>
              <label>
                Subject
                <input
                  value={subject}
                  placeholder="agent:studio"
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label>
                Capability
                <input
                  value={capability}
                  placeholder="file.write"
                  onChange={(event) => setCapability(event.target.value)}
                />
              </label>
              <label>
                {t("allowCommaSeparated")}
                <input
                  value={allow}
                  placeholder="src/, docs/"
                  onChange={(event) => setAllow(event.target.value)}
                />
              </label>
              <div className="lease-grant-row">
                <label>
                  {t("expiresAfterMinutes")}
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={expiresInMinutes}
                    onChange={(event) =>
                      setExpiresInMinutes(Number(event.target.value) || 30)
                    }
                  />
                </label>
                <label>
                  {t("maxInvocationsBlankUnlimited")}
                  <input
                    type="number"
                    min={1}
                    value={invocationBudget}
                    onChange={(event) =>
                      setInvocationBudget(event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={!capability.trim()}
                  onClick={() => void grant()}
                >
                  <KeyRound size={14} /> {t("grantLease")}
                </button>
              </div>
            </div>
          )}
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
