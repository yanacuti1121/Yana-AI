const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_ENTRIES = 9; // matches the ⌘1-⌘9 shortcut range (phasr's pattern)
const MAX_NAME = 60;
const MAX_COMMAND = 2000;
const FILE_NAME = "studio-run-commands.json";

// Named, pinned shell commands (phasr's Pinned Run Commands, MIT — pattern
// only, reimplemented independently). Studio-only state — unlike tasks/
// leases/pending-approvals, yana-rt has no concept of this, so it lives in
// its own `studio-` prefixed file under .yana-ai/, not one the Rust CLI
// also reads/writes. `root` is assumed already validated by the caller
// (main.cjs calls projects.resolve(root) first, same pattern as every
// other project-scoped module here).
class RunCommands {
  file(root) {
    return path.join(root, ".yana-ai", FILE_NAME);
  }
  list(root) {
    const file = this.file(root);
    if (!fs.existsSync(file)) return [];
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Unsafe run-commands file");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  }
  save(root, entries) {
    const file = this.file(root);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temp, "wx", 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(entries), "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temp, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return entries;
  }
  create(root, { name, command }) {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedCommand = typeof command === "string" ? command.trim() : "";
    if (!trimmedName || trimmedName.length > MAX_NAME)
      throw new Error(`Name must be 1-${MAX_NAME} characters`);
    if (!trimmedCommand || trimmedCommand.length > MAX_COMMAND)
      throw new Error(`Command must be 1-${MAX_COMMAND} characters`);
    const entries = this.list(root);
    if (entries.length >= MAX_ENTRIES)
      throw new Error(`At most ${MAX_ENTRIES} pinned commands per project`);
    const entry = {
      id: crypto.randomUUID(),
      name: trimmedName,
      command: trimmedCommand,
      shortcut: entries.length + 1,
      createdAt: Date.now(),
    };
    return this.save(root, [...entries, entry]);
  }
  remove(root, id) {
    const entries = this.list(root).filter((entry) => entry.id !== id);
    return this.save(
      root,
      entries.map((entry, index) => ({ ...entry, shortcut: index + 1 })),
    );
  }
}

module.exports = { RunCommands };
