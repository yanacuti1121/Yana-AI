const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

const MAX_EDIT_FILE = 8 * 1024 * 1024;
const LARGE_FILE = 512 * 1024;
const FILE_WINDOW = 256 * 1024;
const MAX_LIST_PAGE = 500;
const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");
const sensitive = (name) =>
  /^(\.env($|\.)|\.git$|\.ssh$|\.aws$|\.gnupg$)|(^|[._-])(credentials?|secrets?)([._-]|$)|\.(pem|key|p12|pfx)$/i.test(
    name,
  );

class Projects {
  constructor() {
    this.roots = new Set();
  }
  register(root) {
    const resolved = fs.realpathSync(root);
    if (!fs.statSync(resolved).isDirectory())
      throw new Error("Choose a project folder");
    this.roots.add(resolved);
    return { root: resolved, name: path.basename(resolved) };
  }
  resolve(root, relative = "") {
    if (!this.roots.has(root))
      throw new Error("Project was not opened by the user");
    if (
      typeof relative !== "string" ||
      path.isAbsolute(relative) ||
      relative.includes("\0")
    )
      throw new Error("Invalid relative path");
    if (relative.split(/[\\/]/).some(sensitive))
      throw new Error("Credential/internal path is excluded");
    const resolved = fs.realpathSync(path.resolve(root, relative));
    const fromRoot = path.relative(root, resolved);
    if (
      fromRoot === ".." ||
      fromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(fromRoot)
    )
      throw new Error("Path escapes project");
    if (fromRoot.split(/[\\/]/).some(sensitive))
      throw new Error("Resolved credential/internal path is excluded");
    return resolved;
  }
  list(root, relative = "", options = {}) {
    const offset = Math.max(
      0,
      Number.isInteger(options.offset) ? options.offset : 0,
    );
    const limit = Math.max(
      1,
      Math.min(
        MAX_LIST_PAGE,
        Number.isInteger(options.limit) ? options.limit : 200,
      ),
    );
    const query =
      typeof options.query === "string"
        ? options.query.trim().toLowerCase()
        : "";
    const all = fs
      .readdirSync(this.resolve(root, relative), { withFileTypes: true })
      .filter(
        (entry) =>
          !sensitive(entry.name) &&
          !entry.isSymbolicLink() &&
          !["node_modules", "target", "dist"].includes(entry.name),
      )
      .sort(
        (left, right) =>
          Number(right.isDirectory()) - Number(left.isDirectory()) ||
          left.name.localeCompare(right.name),
      )
      .filter((entry) => !query || entry.name.toLowerCase().includes(query));
    return {
      entries: all.slice(offset, offset + limit).map((entry) => ({
        name: entry.name,
        path: path.join(relative, entry.name),
        directory: entry.isDirectory(),
      })),
      offset,
      total: all.length,
      hasMore: offset + limit < all.length,
    };
  }
  read(root, relative) {
    const file = this.resolve(root, relative);
    const descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    let buffer;
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw new Error("Choose a regular file");
      if (stat.size > MAX_EDIT_FILE) return this.readWindow(root, relative, 0);
      const bounded = Buffer.alloc(MAX_EDIT_FILE + 1);
      let length = 0;
      while (length < bounded.length) {
        const read = fs.readSync(
          descriptor,
          bounded,
          length,
          bounded.length - length,
          null,
        );
        if (!read) break;
        length += read;
      }
      if (length > MAX_EDIT_FILE) return this.readWindow(root, relative, 0);
      buffer = bounded.subarray(0, length);
    } finally {
      fs.closeSync(descriptor);
    }
    if (buffer.includes(0)) throw new Error("Binary files are not editable");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return {
      text,
      revision: digest(buffer),
      bytes: buffer.length,
      optimized: buffer.length >= LARGE_FILE,
      readOnly: false,
      truncated: false,
      offset: 0,
      totalBytes: buffer.length,
    };
  }
  readWindow(root, relative, requestedOffset = 0) {
    const file = this.resolve(root, relative);
    const descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw new Error("Choose a regular file");
      const maximum = Math.max(0, stat.size - FILE_WINDOW);
      const offset = Math.max(
        0,
        Math.min(maximum, Number(requestedOffset) || 0),
      );
      const buffer = Buffer.alloc(Math.min(FILE_WINDOW, stat.size - offset));
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
      const window = buffer.subarray(0, length);
      if (window.includes(0)) throw new Error("Binary files are not previewed");
      const text = new TextDecoder("utf-8", { fatal: false }).decode(window);
      return {
        text,
        revision: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`,
        bytes: length,
        optimized: true,
        readOnly: true,
        truncated: stat.size > length,
        offset,
        totalBytes: stat.size,
      };
    } finally {
      fs.closeSync(descriptor);
    }
  }
  write(root, relative, text, revision) {
    if (typeof text !== "string" || Buffer.byteLength(text) > MAX_EDIT_FILE)
      throw new Error(
        "Full-document editing is limited to 8 MiB; use large-file view for bigger files",
      );
    const file = this.resolve(root, relative);
    if (this.read(root, relative).revision !== revision)
      throw new Error(
        "File changed on disk. Reopen it before saving; your draft is retained.",
      );
    const temp = `${file}.yana-studio-${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temp, "wx", fs.statSync(file).mode & 0o777);
      fs.writeFileSync(descriptor, text, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      if (this.read(root, relative).revision !== revision)
        throw new Error("Concurrent file change; save cancelled");
      fs.renameSync(temp, file);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    const bytes = Buffer.byteLength(text);
    return {
      text,
      revision: digest(text),
      bytes,
      optimized: bytes >= LARGE_FILE,
      readOnly: false,
      truncated: false,
      offset: 0,
      totalBytes: bytes,
    };
  }
  async search(root, query, limit = 200) {
    this.resolve(root);
    const needle = String(query || "")
      .trim()
      .toLowerCase();
    if (!needle || needle.length > 200) return [];
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    let paths = [];
    try {
      const result = await this.git(root, [
        "ls-files",
        "-co",
        "--exclude-standard",
        "-z",
      ]);
      paths = result.split("\0").filter(Boolean);
    } catch {
      paths = this.walk(root, "", 20000);
    }
    return paths
      .filter(
        (relative) =>
          !relative.split(/[\\/]/).some(sensitive) &&
          relative.toLowerCase().includes(needle),
      )
      .slice(0, boundedLimit)
      .map((relative) => ({
        name: path.basename(relative),
        path: relative,
        directory: false,
      }));
  }
  walk(root, relative, remaining) {
    if (remaining <= 0) return [];
    const output = [];
    for (const entry of fs.readdirSync(this.resolve(root, relative), {
      withFileTypes: true,
    })) {
      if (
        output.length >= remaining ||
        sensitive(entry.name) ||
        entry.isSymbolicLink() ||
        ["node_modules", "target", "dist"].includes(entry.name)
      )
        continue;
      const next = path.join(relative, entry.name);
      if (entry.isDirectory())
        output.push(...this.walk(root, next, remaining - output.length));
      else if (entry.isFile()) output.push(next);
    }
    return output;
  }
  async git(root, args) {
    this.resolve(root);
    const result = await execFile(
      "git",
      ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args],
      {
        cwd: root,
        timeout: 10000,
        maxBuffer: 2 * MAX_EDIT_FILE,
        windowsHide: true,
        env: { ...process.env, GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" },
      },
    );
    return result.stdout;
  }
  async status(root) {
    try {
      const [raw, branch, trees] = await Promise.all([
        this.git(root, [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=normal",
        ]),
        this.git(root, ["branch", "--show-current"]),
        this.git(root, ["worktree", "list", "--porcelain", "-z"]),
      ]);
      return {
        branch: branch.trim() || "detached HEAD",
        changes: parseStatus(raw),
        worktrees: parseWorktrees(trees),
        error: "",
      };
    } catch (error) {
      return {
        branch: "",
        changes: [],
        worktrees: [],
        error: error.message.slice(0, 240),
      };
    }
  }
  async diff(root, relative) {
    this.resolve(root);
    if (
      typeof relative !== "string" ||
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((part) => part === ".." || sensitive(part))
    )
      throw new Error("Invalid diff path");
    const options = ["--no-ext-diff", "--no-textconv", "--", relative];
    const [working, staged] = await Promise.all([
      this.git(root, ["diff", ...options]),
      this.git(root, ["diff", "--cached", ...options]),
    ]);
    return (
      [staged && `STAGED\n${staged}`, working && `WORKING TREE\n${working}`]
        .filter(Boolean)
        .join("\n") || "No tracked diff (new files can be opened in Files)."
    );
  }
}

function parseStatus(raw) {
  const parts = raw.split("\0");
  const entries = [];
  for (let index = 0; index < parts.length; index++) {
    if (!parts[index]) continue;
    const status = parts[index].slice(0, 2);
    const file = parts[index].slice(3);
    entries.push({ status, path: file });
    if (/[RC]/.test(status)) index++;
  }
  return entries;
}
function parseWorktrees(raw) {
  return raw
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\0");
      return {
        root:
          fields.find((field) => field.startsWith("worktree "))?.slice(9) || "",
        branch:
          fields
            .find((field) => field.startsWith("branch "))
            ?.slice(7)
            .replace("refs/heads/", "") || "detached",
      };
    })
    .filter((tree) => tree.root);
}
module.exports = { Projects, parseStatus, parseWorktrees, digest };
