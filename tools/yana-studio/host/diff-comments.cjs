const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_TEXT = 2000;
const MAX_PER_FILE = 100;
const FILE_NAME = "studio-diff-comments.json";

// emdash's inline-diff-comment pattern (Apache-2.0, see feature-gap
// report) — reimplemented independently. Anchored to the diff view as
// currently shown (file + line index in the rendered diff text), not a
// durable line-in-source anchor: the diff itself is ephemeral (it
// disappears once the change is committed), so this is a note-to-self
// for reviewing an uncommitted change, not a permanent annotation
// system. Studio-only state, same .yana-ai/studio-*.json convention as
// run-commands.cjs/project-memory.cjs. `root` is assumed already
// validated by the caller (projects.resolve(root) in main.cjs).
class DiffComments {
  file(root) {
    return path.join(root, ".yana-ai", FILE_NAME);
  }
  readAll(root) {
    const file = this.file(root);
    if (!fs.existsSync(file)) return {};
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Unsafe diff comments file");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  save(root, all) {
    const file = this.file(root);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temp, "wx", 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(all), "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temp, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return all;
  }
  list(root, relativeFile) {
    if (typeof relativeFile !== "string" || !relativeFile)
      throw new Error("Invalid file path");
    return this.readAll(root)[relativeFile] || [];
  }
  create(root, relativeFile, { lineIndex, lineText, text }) {
    if (typeof relativeFile !== "string" || !relativeFile)
      throw new Error("Invalid file path");
    if (!Number.isInteger(lineIndex) || lineIndex < 0)
      throw new Error("Invalid line index");
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed || trimmed.length > MAX_TEXT)
      throw new Error(`Comment must be 1-${MAX_TEXT} characters`);
    const all = this.readAll(root);
    const existing = all[relativeFile] || [];
    if (existing.length >= MAX_PER_FILE)
      throw new Error(`At most ${MAX_PER_FILE} comments per file`);
    const comment = {
      id: crypto.randomUUID(),
      lineIndex,
      lineText: typeof lineText === "string" ? lineText.slice(0, 400) : "",
      text: trimmed,
      createdAt: Date.now(),
    };
    all[relativeFile] = [...existing, comment];
    this.save(root, all);
    return all[relativeFile];
  }
  remove(root, relativeFile, id) {
    if (typeof relativeFile !== "string" || !relativeFile)
      throw new Error("Invalid file path");
    const all = this.readAll(root);
    all[relativeFile] = (all[relativeFile] || []).filter(
      (comment) => comment.id !== id,
    );
    this.save(root, all);
    return all[relativeFile];
  }
}

module.exports = { DiffComments };
