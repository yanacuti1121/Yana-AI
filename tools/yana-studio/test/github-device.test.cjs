const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  GitHubDeviceProvider,
} = require("../host/integrations/github-device.cjs");

function fixture(results, overrides = {}) {
  let clock = 0;
  const calls = [];
  const waits = [];
  const announcement = [];
  const browser = [];
  const controller = new AbortController();
  const provider = new GitHubDeviceProvider("public-client-id", {
    now: () => clock,
    sleep: async (duration) => {
      waits.push(duration);
      clock += duration;
    },
    request: async (url, options) => {
      calls.push({ url, body: options.body.toString() });
      if (url.endsWith("/device/code"))
        return {
          device_code: "PRIVATE_DEVICE_CODE",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          expires_in: 900,
          interval: 5,
          ...overrides,
        };
      return results.shift();
    },
  });
  const run = () =>
    provider.authorizeDevice({
      scopes: ["read:user"],
      signal: controller.signal,
      announce: (code) => announcement.push(code),
      browser: async (url) => browser.push(url),
    });
  return { run, calls, waits, announcement, browser, controller };
}
test("GitHub device flow waits, backs off, and exposes only user code", async () => {
  const state = fixture([
    { error: "authorization_pending" },
    { error: "slow_down" },
    { access_token: "TOKEN" },
  ]);
  assert.equal((await state.run()).access_token, "TOKEN");
  assert.deepEqual(state.waits, [5000, 5000, 10000]);
  assert.deepEqual(state.announcement, ["ABCD-1234"]);
  assert.deepEqual(state.browser, ["https://github.com/login/device"]);
  assert.ok(state.calls[1].body.includes("device_code=PRIVATE_DEVICE_CODE"));
  assert.doesNotMatch(JSON.stringify(state.calls), /client_secret/);
});
test("GitHub rejects hostile verification URLs before opening browser", async () => {
  const state = fixture([], { verification_uri: "https://evil.example/login" });
  await assert.rejects(state.run(), /invalid_device_response/);
  assert.deepEqual(state.browser, []);
});
test("GitHub denied authorization and device expiry fail visibly", async () => {
  await assert.rejects(
    fixture([{ error: "access_denied" }]).run(),
    /authorization_denied/,
  );
  await assert.rejects(
    fixture([{ error: "expired_token" }]).run(),
    /callback_timeout/,
  );
  const state = fixture([], { expires_in: 3 });
  await assert.rejects(state.run(), /callback_timeout/);
  assert.equal(state.calls.length, 1);
});
test("GitHub cancel prevents polling and untrusted client IDs are rejected", async () => {
  const state = fixture([]);
  state.controller.abort();
  await assert.rejects(state.run(), /user_cancelled/);
  assert.equal(state.calls.length, 1);
  assert.throws(
    () => new GitHubDeviceProvider("../../secret"),
    /invalid_client_id/,
  );
});
