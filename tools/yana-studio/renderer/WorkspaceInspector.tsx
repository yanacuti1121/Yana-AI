import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  Circle,
  FileCode2,
  Folder,
  GitBranch,
  NotebookText,
  RefreshCw,
  Shield,
  Wrench,
} from "lucide-react";
import { ModelManager } from "./ModelManager";
import type { Chat, GitState, Project, State } from "./types";
import { translate, type Locale, type MessageKey } from "./i18n";

// Derived purely from data Studio already tracks (chat.usage, chat.events)
// — no fabricated cost/duration numbers. Runtime events are stamped with
// real kinds from src/chat/headless.rs::write_runtime_event: tool_requested/
// tool_approved/tool_denied/tool_started/tool_completed/turn_completed.
// This turns that existing evidence trail into governance telemetry
// (tool calls, approvals, denials) rather than only a cost/token strip —
// the distinguishing angle over kangentic's Context Bar, which this is
// otherwise inspired by (see the Studio feature-gap report).
function telemetryFor(chat: Chat | undefined, state: State) {
  const events = chat?.events || [];
  const usage = chat?.usageHistory?.length
    ? chat.usageHistory.reduce(
        (total, record) => ({
          input: total.input + record.input,
          output: total.output + record.output,
        }),
        { input: 0, output: 0 },
      )
    : (chat?.usage ?? { input: 0, output: 0 });
  const model = chat?.profile?.model || state.profile.model;
  const provider = state.providerCatalog.find(
    (entry) => entry.id === (chat?.profile?.provider || state.profile.provider),
  );
  return {
    toolCalls: events.filter((event) => event.kind === "tool_completed").length,
    approved: events.filter((event) => event.kind === "tool_approved").length,
    denied: events.filter((event) => event.kind === "tool_denied").length,
    context:
      provider?.modelCatalog.find((entry) => entry.id === model)?.context ||
      "—",
    input: usage.input,
    output: usage.output,
    total: usage.input + usage.output,
  };
}

function activityPresentation(
  event: Chat["events"][number],
  t: (key: MessageKey) => string,
) {
  switch (event.kind) {
    case "tool_requested":
      return { label: t("activityToolProposed"), status: "requested", Icon: Wrench };
    case "tool_approved":
      return { label: t("activityApproved"), status: "approved", Icon: Check };
    case "tool_denied":
      return { label: t("activityDenied"), status: "denied", Icon: Ban };
    case "tool_started":
      return { label: t("activityRunning"), status: "running", Icon: Circle };
    case "tool_completed":
      return { label: t("activityEvidenceRecorded"), status: "completed", Icon: Check };
    case "turn_completed":
      return { label: t("activityTurnCompleted"), status: "completed", Icon: Check };
    default:
      return {
        label: event.kind?.replaceAll("_", " ") || t("activityRuntimeEventFallback"),
        status: "event",
        Icon: Circle,
      };
  }
}

export function WorkspaceInspector({
  state,
  project,
  git,
  chat,
  attachmentCount,
  terminalCount,
  locale,
  onState,
  onError,
  onRefresh,
  onDiff,
  onManageModels,
}: {
  state: State;
  project: Project | null;
  git: GitState;
  chat?: Chat;
  attachmentCount: number;
  terminalCount: number;
  locale: Locale;
  onState: (state: State) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
  onDiff: (path: string) => void;
  onManageModels: () => void;
}) {
  const t = translate(locale);
  const [tab, setTab] = useState<"inspector" | "context" | "models">(
    "inspector",
  );
  const telemetry = telemetryFor(chat, state);
  const [memoryText, setMemoryText] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  useEffect(() => {
    if (!project) {
      setMemoryText("");
      setMemoryDraft("");
      return;
    }
    let active = true;
    void window.studio
      .projectMemoryRead(project.root)
      .then((value) => {
        if (active) {
          setMemoryText(value.text);
          setMemoryDraft(value.text);
        }
      })
      .catch((error) => onError(String(error)));
    return () => {
      active = false;
    };
  }, [project?.root]);
  const saveMemory = () => {
    if (!project) return;
    setMemoryBusy(true);
    void window.studio
      .projectMemoryWrite(project.root, memoryDraft)
      .then((value) => {
        setMemoryText(value.text);
        setMemoryDraft(value.text);
      })
      .catch((error) => onError(String(error)))
      .finally(() => setMemoryBusy(false));
  };
  return (
    <aside className="inspector">
      <div className="inspector-tabs" role="tablist">
        {[
          ["inspector", "Inspector"],
          ["context", "Context"],
          ["models", "AI Models"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "models" ? (
        <section className="inspector-models">
          <div className="section-label">{t("activeModelHeader")}</div>
          <ModelManager
            compact
            state={state}
            locale={locale}
            onState={onState}
            onError={onError}
            onManage={onManageModels}
          />
        </section>
      ) : tab === "context" ? (
        <>
          <section>
            <div className="section-label">{t("projectContextHeader")}</div>
            <div className="card project-card">
              <Folder size={22} />
              <div>
                <strong>{project?.name || t("inspectorNoProjectOpen")}</strong>
                <small>{project?.root || t("chooseFolderOnDisk")}</small>
              </div>
            </div>
          </section>
          <section>
            <div className="section-label">{t("conversationHeader")}</div>
            <div className="context-facts">
              <span>Messages</span>
              <b>{chat?.messages.length || 0}</b>
              <span>Runtime events</span>
              <b>{chat?.events.length || 0}</b>
              <span>Provider</span>
              <b>{chat?.profile?.provider || state.profile.provider}</b>
              <span>Model</span>
              <b>{chat?.profile?.model || state.profile.model || "—"}</b>
            </div>
            <p className="empty-small">{t("contextInclusionNote")}</p>
          </section>
          <section>
            <div className="section-label">
              <NotebookText size={13} /> {t("projectMemoryHeader")}
            </div>
            <p className="empty-small">{t("projectMemoryNote")}</p>
            <textarea
              className="project-memory-editor"
              disabled={!project}
              placeholder={
                project
                  ? t("memoryPlaceholder")
                  : t("memoryPlaceholderNoProject")
              }
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
            />
            <div className="button-row">
              <button
                className="primary"
                disabled={!project || memoryBusy || memoryDraft === memoryText}
                onClick={saveMemory}
              >
                <Check size={14} /> {t("saveMemory")}
              </button>
            </div>
          </section>
          <section>
            <div className="section-label">{t("governanceTelemetryHeader")}</div>
            <div className="telemetry-strip">
              <span
                className="telemetry-item"
                title={t("contextWindowTooltip")}
              >
                {telemetry.context} context
              </span>
              <span className="telemetry-item">
                <b>{telemetry.input.toLocaleString()}</b> in ·{" "}
                <b>{telemetry.output.toLocaleString()}</b> out
              </span>
              <span className="telemetry-item">
                <Wrench size={12} /> {telemetry.toolCalls} tool call
                {telemetry.toolCalls === 1 ? "" : "s"}
              </span>
              <span className="telemetry-item ok">
                <Check size={12} /> {telemetry.approved} approved
              </span>
              <span
                className={`telemetry-item ${telemetry.denied ? "denied" : ""}`}
              >
                <Ban size={12} /> {telemetry.denied} denied
              </span>
            </div>
            <p className="empty-small">{t("telemetryNote")}</p>
          </section>
        </>
      ) : (
        <>
          <div className="inspector-heading">
            <span>Workspace</span>
            <button title="Refresh Git" disabled={!project} onClick={onRefresh}>
              <RefreshCw size={14} />
            </button>
          </div>
          <section className="inspector-session-summary">
            <div className="section-label">{t("currentSessionHeader")}</div>
            <div className="session-summary-grid">
              <div className="session-summary-primary">
                <small>{t("activeModelHeader")}</small>
                <strong>
                  {chat?.profile?.model || state.profile.model || t("inspectorNoModel")}
                </strong>
                <span>
                  {chat?.profile?.provider || state.profile.provider || "—"}
                </span>
              </div>
              <div>
                <small>{t("contextHeaderLabel")}</small>
                <strong>
                  {telemetry.total.toLocaleString()} / {telemetry.context}
                </strong>
                <span>
                  {t("filesTerminalCount")
                    .replace("{files}", String(attachmentCount))
                    .replace("{terminals}", String(terminalCount))}
                </span>
              </div>
              <div>
                <small>{t("sessionHeaderLabel")}</small>
                <strong>
                  {t("eventsCount").replace(
                    "{n}",
                    String(chat?.events.length || 0),
                  )}
                </strong>
                <span>
                  {t("toolsAndPendingCount")
                    .replace("{tools}", String(telemetry.toolCalls))
                    .replace("{pending}", String(chat?.approval ? 1 : 0))}
                </span>
              </div>
              <div>
                <small>{t("usageHeaderLabel")}</small>
                <strong>{telemetry.total.toLocaleString()} tokens</strong>
                <span>
                  ↓ {telemetry.input.toLocaleString()} · ↑{" "}
                  {telemetry.output.toLocaleString()}
                </span>
              </div>
            </div>
          </section>
          <section>
            <div className="section-label">{t("projectHeaderLabel")}</div>
            <div className="card project-card">
              <Folder size={22} />
              <div>
                <strong>{project?.name || t("inspectorNoProjectOpen")}</strong>
                <small>{project?.root || t("chooseFolderOnDisk")}</small>
              </div>
            </div>
            <div className="project-facts">
              <span>
                <GitBranch size={13} /> {git.branch || "—"}
              </span>
              <span>{git.changes.length} changes</span>
            </div>
          </section>
          <section>
            <div className="section-label">
              {t("changesHeaderLabel")}{" "}
              <span className="count">{git.changes.length}</span>
            </div>
            {git.error ? (
              <p className="muted empty-small">{git.error}</p>
            ) : git.changes.length ? (
              <div className="changes-list">
                {git.changes.map((change) => (
                  <button
                    key={change.path}
                    title={change.path}
                    onClick={() => onDiff(change.path)}
                  >
                    <FileCode2 size={13} />
                    <span>{change.path}</span>
                    <code>{change.status.trim()}</code>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-small">
                {project ? t("noGitChanges") : t("noProjectYet")}
              </p>
            )}
          </section>
          <section>
            <div className="section-label">
              {t("activityHeaderLabel")}{" "}
              <span className="live-label">
                <Circle size={7} /> Runtime
              </span>
            </div>
            {chat?.events.length ? (
              <div className="activity-list">
                {[...chat.events].reverse().map((event, index) => {
                  const activity = activityPresentation(event, t);
                  return (
                    <div key={index} className={activity.status}>
                      <activity.Icon size={13} />
                      <span>
                        <b>{activity.label}</b>
                        <small>{event.tool || event.summary || ""}</small>
                      </span>
                      <time>
                        {event.time
                          ? new Date(event.time).toLocaleTimeString("vi", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </time>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-small">{t("noRuntimeEventsNote")}</p>
            )}
          </section>
          <section className="authority-note">
            <Shield size={16} />
            <div>
              <strong>Human-governed</strong>
              <p>{t("aiNoShellBypassNote")}</p>
              {chat?.usage && (
                <small>
                  Input {chat.usage.input.toLocaleString()} · Output{" "}
                  {chat.usage.output.toLocaleString()} tokens
                </small>
              )}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
