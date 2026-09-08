const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_BYTES = 64 * 1024;
const FILE_NAME = "project-memory.md";

// Per-project, persistent, human-edited notes every chat/session should be
// able to read — the shape anh asked for instead of ADE's pinned "CTO"
// chat persona: durable context that isn't itself a conversation, doesn't
// duplicate Studio's existing per-project chat list, and any future agent
// surface can read the same file. Lives at .yana-ai/project-memory.md,
// alongside where yana-rt already keeps its own per-project state
// (leases.json, pending-approvals.json, ledger.jsonl) — `root` is assumed
// already validated by the caller (main.cjs calls projects.resolve(root)
// before delegating here, same pattern as tasks.cjs/permissions.cjs).
class ProjectMemory {
  file(root) {
    return path.join(root, ".yana-ai", FILE_NAME);
  }
  read(root) {
    const file = this.file(root);
    if (!fs.existsSync(file)) return { text: "", updatedAt: 0 };
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Unsafe project memory file");
    return {
      text: fs.readFileSync(file, "utf8"),
      updatedAt: stat.mtimeMs,
    };
  }
  write(root, text) {
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_BYTES)
      throw new Error(`Project memory is limited to ${MAX_BYTES / 1024} KiB`);
    const file = this.file(root);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temp, "wx", 0o600);
      fs.writeFileSync(descriptor, text, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temp, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return this.read(root);
  }
}

module.exports = { ProjectMemory };
