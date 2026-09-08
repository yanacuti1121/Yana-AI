const { app } = require("electron");
const assert = require("node:assert/strict");
const os = require("node:os");
const { Terminals } = require("../host/terminals.cjs");

app.whenReady().then(async () => {
  const output = new Map();
  const manager = new Terminals(require("node-pty").spawn, (channel, event) => {
    if (channel === "terminal:data") {
      output.set(event.id, (output.get(event.id) || "") + event.data);
      manager.acknowledge(event.id, event.sequence);
    }
  });
  const waitFor = async (id, pattern) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (pattern.test(output.get(id) || "")) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(output.get(id) || "", pattern);
  };
  try {
    const first = manager.create(os.tmpdir());
    const second = manager.create(os.tmpdir());
    manager.subscribe(first.id);
    manager.subscribe(second.id);
    const windows = process.platform === "win32";
    manager.write(
      first.id,
      windows ? "echo STUDIO_FIRST\r" : "printf '\\nSTUDIO_FIRST\\n'\r",
    );
    await waitFor(first.id, /STUDIO_FIRST[\r\n]/);
    assert.doesNotMatch(output.get(second.id) || "", /STUDIO_FIRST/);
    if (!windows) {
      manager.write(first.id, "printf '\\nXin chào 안녕 🐰\\n'\r");
      await waitFor(first.id, /Xin chào 안녕 🐰[\r\n]/);
      manager.resize(first.id, 120, 42);
      manager.write(first.id, "stty size\r");
      await waitFor(first.id, /42 120/);
      manager.write(second.id, "printf '\\nSECOND_READY\\n'\r");
      await waitFor(second.id, /SECOND_READY[\r\n]/);
      manager.write(first.id, "printf '\\nFIRST_STILL_ALIVE\\n'\r");
      await waitFor(first.id, /FIRST_STILL_ALIVE[\r\n]/);
      manager.write(first.id, "printf '\\nBEFORE_SLEEP\\n'; sleep 30\r");
      await waitFor(first.id, /BEFORE_SLEEP[\r\n]/);
      await new Promise((resolve) => setTimeout(resolve, 200));
      manager.write(first.id, "\x03");
      await new Promise((resolve) => setTimeout(resolve, 200));
      manager.write(first.id, "printf '\\nAFTER_INTERRUPT\\n'\r");
      try {
        await waitFor(first.id, /AFTER_INTERRUPT[\r\n]/);
      } catch (error) {
        console.error(
          require("node:child_process").execFileSync(
            "ps",
            [
              "-o",
              "pid,ppid,pgid,stat,sigmask,sigignore,comm",
              "-p",
              String(manager.get(first.id).proc.pid),
            ],
            { encoding: "utf8" },
          ),
        );
        throw error;
      }
    }
    manager.dispose();
    assert.equal(manager.sessions.size, 0);
    const deadline = Date.now() + 5000;
    while (manager.closing.size && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(
      manager.closing.size,
      0,
      "Native PTYs must exit before Electron",
    );
    console.log(
      "PASS real Electron PTY: Unicode, 2 independent shells, resize, switch back, cleanup",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    manager.dispose();
    app.exit(1);
  }
});
