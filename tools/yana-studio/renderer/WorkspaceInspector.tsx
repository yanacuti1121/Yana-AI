import { useState } from "react";
import {
  Circle,
  FileCode2,
  Folder,
  GitBranch,
  RefreshCw,
  Shield,
} from "lucide-react";
import { ModelManager } from "./ModelManager";
import type { Chat, GitState, Project, State } from "./types";

export function WorkspaceInspector({
  state,
  project,
  git,
  chat,
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
  onState: (state: State) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
  onDiff: (path: string) => void;
  onManageModels: () => void;
}) {
  const [tab, setTab] = useState<"inspector" | "context" | "models">(
    "inspector",
  );
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
          <div className="section-label">ACTIVE MODEL</div>
          <ModelManager
            compact
            state={state}
            onState={onState}
            onError={onError}
            onManage={onManageModels}
          />
        </section>
      ) : tab === "context" ? (
        <>
          <section>
            <div className="section-label">PROJECT CONTEXT</div>
            <div className="card project-card">
              <Folder size={22} />
              <div>
                <strong>{project?.name || "Chưa mở project"}</strong>
                <small>{project?.root || "Chọn folder trên máy"}</small>
              </div>
            </div>
          </section>
          <section>
            <div className="section-label">CONVERSATION</div>
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
            <p className="empty-small">
              Chỉ context đã chọn hoặc runtime đã xác nhận mới được đưa vào AI.
              Terminal output không tự trở thành evidence.
            </p>
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
          <section>
            <div className="section-label">PROJECT</div>
            <div className="card project-card">
              <Folder size={22} />
              <div>
                <strong>{project?.name || "Chưa mở project"}</strong>
                <small>{project?.root || "Chọn folder trên máy"}</small>
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
              CHANGES <span className="count">{git.changes.length}</span>
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
                {project ? "Không có thay đổi Git." : "Chưa có project."}
              </p>
            )}
          </section>
          <section>
            <div className="section-label">
              ACTIVITY{" "}
              <span className="live-label">
                <Circle size={7} /> Runtime
              </span>
            </div>
            {chat?.events.length ? (
              <div className="activity-list">
                {chat.events
                  .slice(-8)
                  .reverse()
                  .map((event, index) => (
                    <div key={index}>
                      <time>
                        {event.time
                          ? new Date(event.time).toLocaleTimeString("vi", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </time>
                      <span>
                        {event.kind?.replaceAll("_", " ")}
                        <small>{event.tool || event.summary || ""}</small>
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="empty-small">
                Chưa có sự kiện runtime. Không suy diễn tiến độ từ chat hoặc
                terminal.
              </p>
            )}
          </section>
          <section className="authority-note">
            <Shield size={16} />
            <div>
              <strong>Human-governed</strong>
              <p>AI không sử dụng shell của anh để vượt qua phê duyệt.</p>
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
