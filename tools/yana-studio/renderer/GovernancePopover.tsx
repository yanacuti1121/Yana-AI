import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, RefreshCw, Shield, X } from "lucide-react";
import type { Lease, PendingApprovalSummary, SystemOverview } from "./types";
import { translate, type Locale, type MessageKey } from "./i18n";

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

function remainingLabel(expiresAt: string, t: (key: MessageKey) => string) {
  const minutes = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000),
  );
  if (minutes < 60) return t("minutesShort").replace("{n}", String(minutes));
  return t("hoursMinutes")
    .replace("{h}", String(Math.floor(minutes / 60)))
    .replace("{m}", String(minutes % 60));
}

export function GovernancePopover({
  root,
  locale,
  onOpenPermissions,
  onError,
}: {
  root: string;
  locale: Locale;
  onOpenPermissions: () => void;
  onError: (message: string) => void;
}) {
  const t = translate(locale);
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
        title={t("viewSessionAuthorityTitle")}
        onClick={() => setOpen((value) => !value)}
      >
        <Shield size={13} /> {t("governedLabel")}
      </button>
      {open && (
        <div
          className="governance-popover"
          role="dialog"
          aria-label={t("sessionAuthorityHeading")}
        >
          <div className="governance-heading">
            <div>
              <strong>{t("sessionAuthorityHeading")}</strong>
              <small>{t("readDirectlyFromRuntime")}</small>
            </div>
            <button
              aria-label={t("closeSessionAuthorityAria")}
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
                    ? t("notReady")
                    : capability.approval === "None"
                      ? t("allowedLabel")
                      : t("askEveryTime")}
                </b>
              </div>
            ))}
          </div>
          {!data.overview && (
            <p className="empty-small">
              {loading ? t("readingAuthorityData") : t("noAuthorityData")}
            </p>
          )}
          <div className="governance-session">
            <span>
              <Clock3 size={12} />{" "}
              {t("activeLeasesCount").replace(
                "{n}",
                String(activeLeases.length),
              )}
            </span>
            <span>
              {t("pendingApprovalCount").replace(
                "{n}",
                String(data.approvals.filter((item) => !item.resolved).length),
              )}
            </span>
            {nextExpiry && (
              <span>
                {t("nextExpiryLabel").replace(
                  "{time}",
                  remainingLabel(nextExpiry, t),
                )}
              </span>
            )}
          </div>
          <div className="governance-actions">
            <button disabled={loading || !root} onClick={() => void refresh()}>
              <RefreshCw size={13} /> {t("refreshLabel")}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onOpenPermissions();
              }}
            >
              {t("managePermissions")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
