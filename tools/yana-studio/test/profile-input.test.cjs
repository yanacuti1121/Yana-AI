// profileInput() is the shape-level validator sendChat's new profileOverride
// argument (host/main.cjs, per-chat model picker override) runs through --
// main.cjs itself can't be required outside Electron (see chat-turns.test.cjs's
// header comment for why), so this is the one layer of that validation path
// that IS directly testable: reject a malformed "mixture-of-agents" override
// before it ever reaches main.cjs's deeper store-backed preset-existence
// check (requireEnabledMoAPreset, Electron-only).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { profileInput } = require("../host/runtime.cjs");

test("profileInput accepts the auto sentinel with empty model/baseUrl", () => {
  assert.deepEqual(profileInput({ provider: "auto" }), {
    provider: "auto",
    model: "",
    baseUrl: "",
  });
});

test("profileInput accepts a well-formed mixture-of-agents preset id", () => {
  assert.deepEqual(
    profileInput({ provider: "mixture-of-agents", model: "preset-1" }),
    { provider: "mixture-of-agents", model: "preset-1", baseUrl: "" },
  );
});

test("profileInput rejects an empty mixture-of-agents preset id", () => {
  assert.throws(
    () => profileInput({ provider: "mixture-of-agents", model: "" }),
    /Invalid Mixture of Agents preset id/,
  );
});

test("profileInput rejects a mixture-of-agents preset id with a newline", () => {
  assert.throws(
    () =>
      profileInput({ provider: "mixture-of-agents", model: "preset\n1" }),
    /Invalid Mixture of Agents preset id/,
  );
});

test("profileInput rejects a mixture-of-agents preset id over 200 chars", () => {
  assert.throws(
    () =>
      profileInput({ provider: "mixture-of-agents", model: "x".repeat(201) }),
    /Invalid Mixture of Agents preset id/,
  );
});

test("profileInput rejects an unknown provider (composer override typo/tamper guard)", () => {
  assert.throws(
    () => profileInput({ provider: "not-a-real-provider", model: "x" }),
    /Unsupported provider/,
  );
});
