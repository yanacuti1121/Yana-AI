const crypto = require("node:crypto");
const os = require("node:os");

class Terminals {
  constructor(spawn, emit) {
    this.spawn = spawn;
    this.emit = emit;
    this.sessions = new Map();
    this.serial = 0;
    this.closing = new Set();
  }
  create(root, cols = 100, rows = 24) {
    if (this.sessions.size >= 12)
      throw new Error("Close a terminal before opening more (limit 12)");
    const shell =
      process.platform === "win32"
        ? process.env.COMSPEC || "cmd.exe"
        : os.userInfo().shell || "/bin/zsh";
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const proc = this.spawn(shell, process.platform === "win32" ? [] : ["-l"], {
      cwd: root,
      cols: dimension(cols, 400),
      rows: dimension(rows, 200),
      name: "xterm-256color",
      env,
    });
    const id = crypto.randomUUID();
    const session = {
      id,
      label: `Terminal ${++this.serial}`,
      root,
      proc,
      sequence: 0,
      ack: 0,
      pending: [],
      paused: false,
      subscribed: false,
      exited: false,
    };
    this.sessions.set(id, session);
    proc.onData((data) => {
      if (session.closed) return;
      session.sequence += data.length;
      const event = { id, data, sequence: session.sequence };
      if (!session.subscribed) session.pending.push(event);
      else this.emit("terminal:data", event);
      if (session.sequence - session.ack > 128 * 1024 && !session.paused) {
        proc.pause();
        session.paused = true;
      }
    });
    proc.onExit((event) => {
      session.exited = true;
      this.closing.delete(session);
      session.exitCode = event.exitCode;
      if (session.subscribed && !session.closed)
        this.emit("terminal:exit", { id, exitCode: event.exitCode });
    });
    return { id, root, label: session.label };
  }
  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Terminal no longer exists");
    return session;
  }
  subscribe(id) {
    const session = this.get(id);
    session.subscribed = true;
    for (const event of session.pending) this.emit("terminal:data", event);
    session.pending = [];
    if (session.exited)
      this.emit("terminal:exit", { id, exitCode: session.exitCode });
  }
  write(id, text) {
    if (typeof text !== "string" || text.length > 65536)
      throw new Error("Terminal input too large");
    const session = this.get(id);
    if (!session.exited) session.proc.write(text);
  }
  resize(id, cols, rows) {
    const session = this.get(id);
    if (!session.exited)
      session.proc.resize(dimension(cols, 400), dimension(rows, 200));
  }
  acknowledge(id, sequence) {
    const session = this.get(id);
    if (!Number.isSafeInteger(sequence) || sequence < 0) return;
    session.ack = Math.max(session.ack, Math.min(sequence, session.sequence));
    if (session.paused && session.sequence - session.ack < 32 * 1024) {
      session.paused = false;
      session.proc.resume();
    }
  }
  close(id) {
    const session = this.get(id);
    session.closed = true;
    if (!session.exited) {
      this.closing.add(session);
      session.proc.kill();
    }
    this.sessions.delete(id);
  }
  dispose() {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
function dimension(value, max) {
  if (!Number.isInteger(value) || value < 2 || value > max)
    throw new Error("Invalid terminal size");
  return value;
}
module.exports = { Terminals, dimension };
