const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

// Screen 4 "Permissions" (SCREEN-STATUS.md — was "Chat approval
// presentation" only). Two real, distinct Rust stores, both project-scoped
// (`.yana-ai/{leases,pending-approvals}.json` relative to the runtime's
// cwd — this is why every call here passes `cwd: root`, unlike
// devices.cjs's host-level command):
//
// - `yana-rt lease list/revoke --json` — src/capability/lease.rs::Lease.
//   Time-boxed, scope-boxed delegated authority (e.g. for a subagent),
//   independent of any one chat turn.
// - `yana-rt authority pending-approvals --json` — src/runtime/
//   pending_approval.rs::PendingApproval. Durable pauses across ANY
//   client (Terminal, Desktop, other yana-rt invocations), not just
//   Studio's own chat — Studio's existing chat.approval/decideApproval
//   only resolves an approval that paused *this* chat's own turn; this
//   list can include approvals paused by something else entirely. This
//   module deliberately does not expose a generic "resolve" action for
//   those — deciding one safely requires the exact provider/api-key/turn
//   context that only the client which paused it holds.
//
// Only the fields this screen actually renders are typed/kept — a
// PendingApproval record also carries full conversation `messages` and
// `context`, which this module does not surface into the renderer.
class Permissions {
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
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    });
    return result.stdout;
  }
  async leaseList(root) {
    const parsed = JSON.parse(
      await this.run(root, ["lease", "list", "--json"]),
    );
    return Array.isArray(parsed) ? parsed : [];
  }
  async leaseRevoke(root, id) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid lease id");
    return JSON.parse(
      await this.run(root, ["lease", "revoke", id.trim(), "--json"]),
    );
  }
  async pendingApprovals(root) {
    const parsed = JSON.parse(
      await this.run(root, ["authority", "pending-approvals", "--json"]),
    );
    return Array.isArray(parsed) ? parsed : [];
  }
  // The scoped-lease alternative to a bare "auto-accept" toggle: grants
  // real, time-boxed, budget-capped authority via yana-rt's own lease
  // mechanism (src/capability/lease.rs::cmd_lease_grant) — the runtime's
  // authority chain (src/runtime/authority.rs) consumes a matching lease
  // before ever reaching human-approval-required, so this doesn't bypass
  // governance, it *is* governance, the same path a delegated subagent
  // lease already goes through.
  async leaseGrant(root, options) {
    const subject =
      typeof options?.subject === "string" ? options.subject.trim() : "";
    const capability =
      typeof options?.capability === "string" ? options.capability.trim() : "";
    if (!subject) throw new Error("Enter a subject (e.g. agent:studio)");
    if (!capability) throw new Error("Enter a capability name");
    const expiresInMinutes = Math.max(
      1,
      Math.min(1440, Number(options?.expiresInMinutes) || 30),
    );
    const args = [
      "lease",
      "grant",
      "--subject",
      subject,
      "--capability",
      capability,
      "--expires-in-minutes",
      String(expiresInMinutes),
      "--json",
    ];
    for (const entry of Array.isArray(options?.allow) ? options.allow : [])
      if (typeof entry === "string" && entry.trim())
        args.push("--allow", entry.trim());
    for (const entry of Array.isArray(options?.deny) ? options.deny : [])
      if (typeof entry === "string" && entry.trim())
        args.push("--deny", entry.trim());
    if (Number.isInteger(options?.invocationBudget))
      args.push("--invocation-budget", String(options.invocationBudget));
    return JSON.parse(await this.run(root, args));
  }
}
module.exports = { Permissions };
