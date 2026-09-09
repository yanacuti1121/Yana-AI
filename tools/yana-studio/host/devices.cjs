const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

// Screen 3 "Devices" (SCREEN-STATUS.md — was "Not implemented"). Host-level,
// not project-scoped — `yana-rt os host status --json` reports the machine
// Yana is running on (src/os/platform/profile.rs::HostProfile), the same
// contract the legacy Yana Desktop's DevicesView already used
// (window.yana.hostStatus() -> yana-rt os host status --json). Read-only,
// no approval flow needed. Every field this command could not reliably
// determine comes back `null`/"unknown" from the runtime itself — this
// module must not paper over that with a fabricated value.
async function hostStatus(runtime) {
  if (!runtime) throw new Error("Configure the Yana runtime first");
  const { stdout } = await execFile(
    runtime,
    ["os", "host", "status", "--json"],
    {
      timeout: 5000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
      env: process.env,
    },
  );
  return JSON.parse(stdout);
}
module.exports = { hostStatus };
