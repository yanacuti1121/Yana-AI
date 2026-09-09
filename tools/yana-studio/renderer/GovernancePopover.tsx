import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, RefreshCw, Shield, X } from "lucide-react";
import type { Lease, PendingApprovalSummary, SystemOverview } from "./types";

type GovernanceData = {
  overview: SystemOverview | null;
  leases: Lease[];
  approvals: PendingApprovalSummary[];
};

const emptyData: GovernanceData = {
  overview: null,
  leases: [],
  approvals: [],
};

function remainingLabel(expiresAt: string) {
  const minutes = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000),
  );
  if (minutes < 60) return `${minutes} phút`;
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export function GovernancePopover({
  root,
  onOpenPermissions,
  onError,
}: {
  root: string;
  onOpenPermissions: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GovernanceData>(emptyData);
  const anchor = useRef<HTMLDivElement>(null);
  const activeLeases = useMemo(
    () =>
      data.leases.filter(
        (lease) =>
          !lease.revoked &&
          lease.remaining !== 0 &&
          new Date(lease.expires_at).getTime() > Date.now(),
      ),
    [data.leases],
  );
  const nextExpiry = activeLeases
    .map((lease) => lease.expires_at)
    .sort((left, right) => left.localeCompare(right))[0];

  const refresh = useCallback(async () => {
    if (!root) return;
    setLoading(true);
    try {
      const [overview, leases, approvals] = await Promise.all([
        window.studio.systemOverview(root),
        window.studio.leaseList(root),
        window.studio.pendingApprovals(root),
      ]);
      setData({ overview, leases, approvals });
    } catch (error) {
      onError(String(error));
    } finally {
      setLoading(false);
    }
  }, [onError, root]);

  useEffect(() => {
    setOpen(false);
    setData(emptyData);
  }, [root]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const close = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, refresh]);

  return (
    <div className="governance-anchor" ref={anchor}>
      <button
        className="composer-governance"
        aria-expanded={open}
        title="Xem quyền hạn thật của phiên này"
        onClick={() => setOpen((value) => !value)}
      >
        <Shield size={13} /> Có kiểm soát
      </button>
      {open && (
        <div
          className="governance-popover"
          role="dialog"
          aria-label="Quyền của phiên"
        >
          <div className="governance-heading">
            <div>
              <strong>Quyền của phiên</strong>
              <small>Đọc trực tiếp từ Yana runtime</small>
            </div>
            <button
              aria-label="Đóng quyền của phiên"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="governance-capabilities">
            {(data.overview?.capabilities || []).map((capability) => (
              <div key={capability.name}>
                <span>
                  <Check size={12} /> {capability.name}
                </span>
                <b
                  className={
                    !capability.available
                      ? "unavailable"
                      : capability.approval === "None"
                        ? "allowed"
                        : "ask"
                  }
                >
                  {!capability.available
                    ? "Chưa sẵn sàng"
                    : capability.approval === "None"
                      ? "Cho phép"
                      : "Hỏi mỗi lần"}
                </b>
              </div>
            ))}
          </div>
          {!data.overview && (
            <p className="empty-small">
              {loading ? "Đang đọc quyền hạn…" : "Chưa có dữ liệu quyền hạn."}
            </p>
          )}
          <div className="governance-session">
            <span>
              <Clock3 size={12} /> {activeLeases.length} lease đang hoạt động
            </span>
            <span>
              {data.approvals.filter((item) => !item.resolved).length} chờ duyệt
            </span>
            {nextExpiry && (
              <span>Hết hạn gần nhất: {remainingLabel(nextExpiry)}</span>
            )}
          </div>
          <div className="governance-actions">
            <button disabled={loading || !root} onClick={() => void refresh()}>
              <RefreshCw size={13} /> Làm mới
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onOpenPermissions();
              }}
            >
              Quản lý quyền
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
