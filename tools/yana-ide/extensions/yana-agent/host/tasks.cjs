const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

const MAX_NAME = 500;
const MAX_SCOPE = 200;
const MAX_EVIDENCE = 4000;
const DEPENDENCY_TYPES = [
  "blocks",
  "related",
  "parent-child",
  "discovered-from",
];

// Mirrors src/task.rs's TaskDependency/DependencyType and the additive
// `blocked`/`blocked_by` fields `cmd_task_list --json` emits (Yana Studio
// architecture audit, Phase 1 — PR #318). `task list --json` alone carries
// everything a Tasks screen needs (status, scope, dependencies, derived
// blocked state); there is no separate per-task JSON endpoint to call.
class Tasks {
  constructor(runtime) {
    this.runtime = runtime; // () => current yana-rt binary path
  }
  binary() {
    const path = this.runtime();
    if (!path) throw new Error("Configure the Yana runtime first");
    return path;
  }
  async run(root, args) {
    const result = await execFile(this.binary(), args, {
      cwd: root,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    });
    return result.stdout;
  }
  async list(root) {
    const raw = await this.run(root, ["task", "list", "--json"]);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  }
  async create(root, name, scope) {
    if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME)
      throw new Error(`Task name is required (max ${MAX_NAME} characters)`);
    const args = ["task", "create", name.trim(), "--json"];
    if (typeof scope === "string" && scope.trim()) {
      if (scope.length > MAX_SCOPE) throw new Error("Scope is too long");
      args.push("--scope", scope.trim());
    }
    return JSON.parse(await this.run(root, args));
  }
  async done(root, id, evidence) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid task id");
    if (
      typeof evidence !== "string" ||
      !evidence.trim() ||
      evidence.length > MAX_EVIDENCE
    )
      throw new Error(
        `Evidence is required to mark a task done (max ${MAX_EVIDENCE} characters)`,
      );
    return JSON.parse(
      await this.run(root, [
        "task",
        "done",
        id.trim(),
        "--evidence",
        evidence.trim(),
        "--json",
      ]),
    );
  }
  async drop(root, id) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid task id");
    return JSON.parse(
      await this.run(root, ["task", "drop", id.trim(), "--json"]),
    );
  }
  async depend(root, id, on, type) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid task id");
    if (typeof on !== "string" || !on.trim())
      throw new Error("Invalid target task id");
    const kind = typeof type === "string" ? type.trim() : "blocks";
    if (!DEPENDENCY_TYPES.includes(kind))
      throw new Error(
        `Dependency type must be one of: ${DEPENDENCY_TYPES.join(", ")}`,
      );
    return JSON.parse(
      await this.run(root, [
        "task",
        "depend",
        id.trim(),
        "--on",
        on.trim(),
        "--type",
        kind,
        "--json",
      ]),
    );
  }
}
module.exports = { Tasks, DEPENDENCY_TYPES };
