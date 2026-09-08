import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  RefreshCw,
  Search,
  Shield,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type { Locale, SystemOverview } from "./types";

const copy = async (value: string) => {
  await navigator.clipboard.writeText(value);
};

function Empty({ children }: { children: string }) {
  return <p className="system-empty">{children}</p>;
}

export function SystemSurfaces({
  mode,
  locale,
  projectRoot,
  onOpenTerminal,
  onError,
}: {
  mode: "permissions" | "tools" | "commands";
  locale: Locale;
  projectRoot: string;
  onOpenTerminal: (command?: string) => void;
  onError: (message: string) => void;
}) {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [query, setQuery] = useState("");
  const labels =
    locale === "ko"
      ? {
          refresh: "새로고침",
          copy: "복사",
          terminal: "터미널에서 열기",
          unavailable: "사용 불가",
        }
      : locale === "en"
        ? {
            refresh: "Refresh",
            copy: "Copy",
            terminal: "Open in terminal",
            unavailable: "Unavailable",
          }
        : {
            refresh: "Làm mới",
            copy: "Sao chép",
            terminal: "Mở trong terminal",
            unavailable: "Chưa khả dụng",
          };
  const refresh = () =>
    window.studio
      .systemOverview(projectRoot)
      .then(setOverview)
      .catch((error) => onError(String(error)));
  useEffect(() => {
    refresh();
  }, [projectRoot]);
  const commands = useMemo(() => {
    const value = query.trim().toLowerCase();
    return (
      overview?.commands.commands.filter(
        (item) =>
          !value ||
          `${item.category} ${item.command} ${item.description}`
            .toLowerCase()
            .includes(value),
      ) || []
    );
  }, [overview, query]);
  if (!overview) return <Empty>Đang đọc trạng thái Yana runtime…</Empty>;
  const heading =
    mode === "permissions"
      ? "Capability registry"
      : mode === "tools"
        ? "Remote & external tools"
        : "Command reference";
  return (
    <section className="system-surface">
      <div className="settings-heading-row">
        <div>
          <h2>{heading}</h2>
          <p className="muted">
            Dữ liệu đọc từ runtime, PATH và contract đang có trong Yana.
          </p>
        </div>
        <button onClick={refresh}>
          <RefreshCw size={15} /> {labels.refresh}
        </button>
      </div>
      {mode === "permissions" && (
        <div className="capability-list">
          {overview.capabilities.map((capability) => (
            <article className="card capability-card" key={capability.name}>
              <div>
                <code>{capability.name}</code>
                <p>{capability.description}</p>
              </div>
              <div className="capability-badges">
                <span>
                  {capability.accessMode === "ReadOnly"
                    ? "Read-only"
                    : "Mutating"}
                </span>
                <span className={`risk-${capability.riskTier.toLowerCase()}`}>
                  {capability.riskTier}
                </span>
                <span>
                  {capability.approval === "None"
                    ? "No approval"
                    : "Needs approval"}
                </span>
                <span
                  className={
                    capability.available ? "status-good" : "status-muted"
                  }
                >
                  {capability.available ? "Available now" : labels.unavailable}
                </span>
              </div>
            </article>
          ))}
          <div className="card boundary-note">
            <Shield size={18} />
            <p>
              Pending approvals are shown inside the conversation that owns the
              turn. This page is visibility only and never approves on another
              turn's behalf.
            </p>
          </div>
        </div>
      )}
      {mode === "tools" && (
        <div className="tool-sections">
          <article className="card tool-card">
            <span className="eyebrow">REMOTE CHAT</span>
            <h2>Discord</h2>
            <p>
              Plain authenticated chat only. Repository, Git, process and tool
              capabilities are never exposed to Discord.
            </p>
            <div className="capability-badges">
              <span>
                {overview.runtime.discord
                  ? "Runtime feature available"
                  : "Runtime feature absent"}
              </span>
              <span>
                {overview.discord.configured
                  ? "Credential detected"
                  : "Credential required"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Allowed channels</dt>
                <dd>{overview.discord.channels}</dd>
              </div>
              <div>
                <dt>Allowed users</dt>
                <dd>{overview.discord.users}</dd>
              </div>
              <div>
                <dt>Credential boundary</dt>
                <dd>Managed outside renderer</dd>
              </div>
            </dl>
            {overview.discord.warning && (
              <p className="error-text">{overview.discord.warning}</p>
            )}
          </article>
          <article className="card tool-card">
            <span className="eyebrow">TOOL PROTOCOL</span>
            <h2>MCP</h2>
            <p>
              MCP is opt-in over stdio. Workspace mutations remain governed and
              approval-only operations stay denied.
            </p>
            <div className="capability-badges">
              <span
                className={
                  overview.runtime.mcp ? "status-good" : "status-muted"
                }
              >
                {overview.runtime.mcp
                  ? "MCP available"
                  : "MCP not in this runtime"}
              </span>
              <span>stdio</span>
            </div>
            <code>yana-rt mcp</code>
          </article>
          <article className="card tool-card">
            <span className="eyebrow">HUMAN TERMINAL</span>
            <h2>External coding tools</h2>
            <p>
              Detection checks the Desktop process PATH. These tools run in the
              human PTY; their output is never verified Yana evidence.
            </p>
            <div className="external-tool-grid">
              {overview.externalTools.map((tool) => (
                <div key={tool.command}>
                  {tool.available ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  <strong>{tool.label}</strong>
                  <code>{tool.command}</code>
                  <small>{tool.available ? tool.path : "Not found"}</small>
                </div>
              ))}
            </div>
            <button onClick={() => onOpenTerminal()}>
              <TerminalSquare size={15} /> {labels.terminal}
            </button>
          </article>
        </div>
      )}
      {mode === "commands" && (
        <>
          <label className="command-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter commands…"
            />
          </label>
          {overview.commands.error ? (
            <Empty>{overview.commands.error}</Empty>
          ) : (
            <div className="command-groups">
              {[...new Set(commands.map((item) => item.category))].map(
                (category) => (
                  <section key={category}>
                    <h3>{category}</h3>
                    {commands
                      .filter((item) => item.category === category)
                      .map((item) => (
                        <article
                          className="command-row"
                          key={`${category}:${item.command}`}
                        >
                          <code>{item.command}</code>
                          <div className="command-actions">
                            <button
                              title={labels.copy}
                              onClick={() =>
                                void copy(item.command).catch((error) =>
                                  onError(String(error)),
                                )
                              }
                            >
                              <Clipboard size={14} />
                            </button>
                            <button
                              onClick={() => onOpenTerminal(item.command)}
                            >
                              <ExternalLink size={14} /> {labels.terminal}
                            </button>
                          </div>
                          <p>{item.description}</p>
                        </article>
                      ))}
                  </section>
                ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
