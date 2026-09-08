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
}
module.exports = { Permissions };
