import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  GitBranch,
  Link2,
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Task, TaskDependencyType } from "./types";

// Screen 8 "Tasks" (SCREEN-STATUS.md — was "Not implemented"). Backed by
// the real Rust task store via `yana-rt task *` (Yana Studio architecture
// audit, Phase 1 — PR #318): `blocked`/`blocked_by` are always derived by
// the runtime from typed dependency edges, never hand-set here — this
// screen never writes a "blocked" status directly, only proposes
// dependencies and lets the runtime compute the rest.
export function Tasks({
  root,
  onError,
}: {
  root: string;
  onError: (message: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftScope, setDraftScope] = useState("");
  const [doneFor, setDoneFor] = useState<Task | null>(null);
  const [evidence, setEvidence] = useState("");
  const [dependFor, setDependFor] = useState<Task | null>(null);
  const [dependOn, setDependOn] = useState("");
  const [dependType, setDependType] = useState<TaskDependencyType>("blocks");

  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      onError(String(error));
    }
  };
  const refresh = () =>
    run(async () => setTasks(await window.studio.taskList(root)));
  useEffect(() => {
    setTasks([]);
    void refresh();
  }, [root]);

  const create = () =>
    run(async () => {
      if (!draftName.trim()) return;
      await window.studio.taskCreate(root, draftName, draftScope || undefined);
      setDraftName("");
      setDraftScope("");
      await refresh();
    });
  const markDone = () =>
    run(async () => {
      if (!doneFor || !evidence.trim()) return;
      await window.studio.taskDone(root, doneFor.id, evidence);
      setDoneFor(null);
      setEvidence("");
      await refresh();
    });
  const dropTask = (task: Task) =>
    run(async () => {
      await window.studio.taskDrop(root, task.id);
      await refresh();
    });
  const addDependency = () =>
    run(async () => {
      if (!dependFor || !dependOn) return;
      await window.studio.taskDepend(root, dependFor.id, dependOn, dependType);
      setDependFor(null);
      setDependOn("");
      await refresh();
    });

  const nameOf = (id: string) =>
    tasks.find((item) => item.id === id)?.name || id.slice(0, 8);

  return (
    <div className="tasks-workspace">
      <div className="tasks-header">
        <div className="section-label">
          <ListTodo size={14} /> TASKS
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
        <p className="empty-small">Open a project to see its tasks.</p>
      ) : (
        <>
          <div className="task-create card">
            <input
              value={draftName}
              placeholder="New task…"
              maxLength={500}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
            />
            <input
              value={draftScope}
              placeholder="Scope (optional)"
              maxLength={200}
              onChange={(event) => setDraftScope(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
            />
            <button
              className="primary"
              disabled={!draftName.trim()}
              onClick={create}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {!tasks.length ? (
            <p className="empty-small">
              No tasks yet. yana-rt task create "description" from the terminal
              works the same way.
            </p>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <div
                  className={`task-row ${task.status === "done" ? "done" : ""} ${task.blocked ? "blocked" : ""}`}
                  key={task.id}
                >
                  <div className="task-status">
                    {task.status === "done" ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Circle size={16} />
                    )}
                  </div>
                  <div className="task-main">
                    <strong>{task.name}</strong>
                    <div className="task-meta">
                      {task.scope && <span>{task.scope}</span>}
                      {task.blocked && (
                        <span className="task-blocked-tag">
                          blocked by {task.blocked_by.map(nameOf).join(", ")}
                        </span>
                      )}
                      {task.evidence && (
                        <span className="muted" title={task.evidence.raw}>
                          {task.evidence.raw.slice(0, 60)}
                        </span>
                      )}
                    </div>
                    {task.dependencies.length > 0 && (
                      <div className="task-dependencies">
                        {task.dependencies.map((dependency, index) => (
                          <span key={index}>
                            <Link2 size={11} />
                            {dependency.dep_type} →{" "}
                            {nameOf(dependency.target_task_id)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="task-actions">
                    {task.status !== "done" && (
                      <button
                        title="Mark done"
                        onClick={() => {
                          setDoneFor(task);
                          setEvidence("");
                        }}
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    {task.status !== "done" && (
                      <button
                        title="Add dependency"
                        onClick={() => {
                          setDependFor(task);
                          setDependOn("");
                          setDependType("blocks");
                        }}
                      >
                        <GitBranch size={14} />
                      </button>
                    )}
                    <button
                      title="Drop task"
                      onClick={() => void dropTask(task)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {doneFor && (
        <div className="modal-backdrop" onClick={() => setDoneFor(null)}>
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Mark "{doneFor.name}" done</h3>
            <p className="muted">
              Evidence is required — a bare checkbox is not enough (Yana Studio
              architecture audit).
            </p>
            <textarea
              autoFocus
              value={evidence}
              placeholder="e.g. 12 tests passed, build OK"
              onChange={(event) => setEvidence(event.target.value)}
              rows={4}
            />
            <div className="button-row">
              <button
                className="primary"
                disabled={!evidence.trim()}
                onClick={markDone}
              >
                Mark done
              </button>
              <button onClick={() => setDoneFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {dependFor && (
        <div className="modal-backdrop" onClick={() => setDependFor(null)}>
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>"{dependFor.name}" depends on…</h3>
            <select
              value={dependOn}
              onChange={(event) => setDependOn(event.target.value)}
            >
              <option value="">Choose a task…</option>
              {tasks
                .filter((item) => item.id !== dependFor.id)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <select
              value={dependType}
              onChange={(event) =>
                setDependType(event.target.value as TaskDependencyType)
              }
            >
              <option value="blocks">blocks (affects readiness)</option>
              <option value="related">related (informational)</option>
              <option value="parent_child">parent-child (informational)</option>
              <option value="discovered_from">
                discovered-from (informational)
              </option>
            </select>
            <div className="button-row">
              <button
                className="primary"
                disabled={!dependOn}
                onClick={addDependency}
              >
                Add dependency
              </button>
              <button onClick={() => setDependFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
