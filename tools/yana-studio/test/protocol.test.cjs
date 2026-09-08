const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { startRuntime } = require("../host/runtime.cjs");

function execute(task, options = {}) {
  const events = [];
  let invocation;
  const finished = new Promise((resolve) => {
    const run = startRuntime(
      process.execPath,
      __dirname,
      { provider: "custom", model: "test" },
      { task, api_key: "private-test-key" },
      (event) => events.push(event),
      resolve,
      false,
      (binary, args, spawnOptions) => {
        invocation = { binary, args };
        return spawn(
          process.execPath,
          [path.join(__dirname, "protocol-fixture.cjs")],
          spawnOptions,
        );
      },
    );
    if (options.cancel) setTimeout(() => run.stop(), 100);
  });
  return finished.then(() => ({ events, invocation }));
}
test("NDJSON preserves UTF-8 split across OS pipe chunks and final unterminated line", async () => {
  const { events, invocation } = await execute("unicode");
  assert.equal(events[0].text, "Xin chào 🐰");
  assert.equal(events[1].message, "Xin chào 🐰");
  assert.ok(!invocation.args.join(" ").includes("private-test-key"));
});
test("invalid and oversized runtime output fail visibly", async () => {
  for (const task of ["invalid", "large"]) {
    const { events } = await execute(task);
    assert.equal(events.at(-1).type, "error");
  }
});
test("EOF without completion is not reported as success", async () => {
  const { events } = await execute("unfinished");
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).message, /without completion/);
});
test("credential is excluded from argv and redacted from error output", async () => {
  const { events } = await execute("secret");
  assert.equal(events[0].message, "bad [redacted]");
});
test("cancellation stops a real child process and emits cancelled", async () => {
  const start = Date.now();
  const { events } = await execute("sleep", { cancel: true });
  assert.equal(events.at(-1).type, "cancelled");
  assert.ok(Date.now() - start < 3000);
});
