const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AccountStore } = require("../host/account.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yana-studio-account-"));
}

test("fresh store reports unconfigured, then creates a local profile", () => {
  const directory = tempDir();
  const store = new AccountStore(directory);
  assert.deepEqual(store.status(), {
    configured: false,
    locked: false,
    mode: "none",
    email: "",
    displayName: "",
  });
  const status = store.createLocal({
    email: "Anh@Example.com",
    displayName: "Anh",
    password: "correcthorsebatterystaple",
  });
  assert.equal(status.configured, true);
  assert.equal(status.locked, false);
  assert.equal(status.mode, "local");
  // Emails are normalized (trimmed + lowercased) so lookups/comparisons
  // don't depend on how the user happened to type it.
  assert.equal(status.email, "anh@example.com");
});

test("createLocal rejects a second account and validates its inputs", () => {
  const directory = tempDir();
  const store = new AccountStore(directory);
  assert.throws(
    () => store.createLocal({ email: "not-an-email", displayName: "A", password: "correcthorsebatterystaple" }),
    /valid email/,
  );
  assert.throws(
    () => store.createLocal({ email: "a@b.com", displayName: "  ", password: "correcthorsebatterystaple" }),
    /display name/,
  );
  assert.throws(
    () => store.createLocal({ email: "a@b.com", displayName: "A", password: "short" }),
    /at least 10 characters/,
  );
  store.createLocal({ email: "a@b.com", displayName: "A", password: "correcthorsebatterystaple" });
  assert.throws(
    () => store.createLocal({ email: "c@d.com", displayName: "C", password: "correcthorsebatterystaple" }),
    /already configured/,
  );
});

test("password is never stored in plaintext, and only the exact password unlocks", () => {
  const directory = tempDir();
  const store = new AccountStore(directory);
  store.createLocal({ email: "a@b.com", displayName: "A", password: "correcthorsebatterystaple" });
  const raw = fs.readFileSync(path.join(directory, "account-v1.json"), "utf8");
  assert.doesNotMatch(raw, /correcthorsebatterystaple/);
  assert.throws(() => store.unlock("wrong-password"), /Incorrect password/);
  assert.throws(() => store.unlock("wrong-password"), /Incorrect password/);
  const status = store.unlock("correcthorsebatterystaple");
  assert.equal(status.locked, false);
});

test("lock keeps the profile on disk and requires the password again -- logout deletes it", () => {
  const directory = tempDir();
  const first = new AccountStore(directory);
  first.createLocal({ email: "a@b.com", displayName: "A", password: "correcthorsebatterystaple" });
  first.lock();
  assert.equal(first.status().locked, true);
  assert.equal(first.status().configured, true);

  // Restart persistence: a brand-new AccountStore reading the same
  // directory must see the same locked local profile, not lose it.
  const restarted = new AccountStore(directory);
  assert.equal(restarted.status().configured, true);
  assert.equal(restarted.status().locked, true);
  assert.throws(() => restarted.unlock("wrong"), /Incorrect password/);
  restarted.unlock("correcthorsebatterystaple");
  assert.equal(restarted.status().locked, false);

  restarted.logout();
  assert.equal(restarted.status().configured, false);
  assert.equal(fs.existsSync(path.join(directory, "account-v1.json")), false);

  // logout() on an already-empty store fails loudly rather than
  // silently no-op-ing.
  assert.throws(() => restarted.logout(), /No account configured/);
});

test("useGoogle requires an already-connected Google identity and cannot double-configure", () => {
  const directory = tempDir();
  const store = new AccountStore(directory);
  assert.throws(
    () => store.useGoogle({ status: "not_connected" }),
    /Connect Google Account first/,
  );
  const status = store.useGoogle({
    status: "connected",
    account_id: "g-123",
    email: "anh@gmail.com",
    display_name: "Anh",
  });
  assert.equal(status.mode, "google");
  assert.equal(status.email, "anh@gmail.com");
  // Google-mode profiles have no local password -- lock() is a no-op for
  // them (there is nothing to re-unlock with), matching the renderer only
  // showing a Lock button for mode === "local".
  assert.equal(store.lock().locked, false);
  assert.throws(
    () => store.useGoogle({ status: "connected", account_id: "g-456" }),
    /already configured/,
  );
});

test("a corrupted or tampered account file fails closed instead of silently resetting", () => {
  const directory = tempDir();
  const store = new AccountStore(directory);
  store.createLocal({ email: "a@b.com", displayName: "A", password: "correcthorsebatterystaple" });
  fs.writeFileSync(path.join(directory, "account-v1.json"), JSON.stringify({ mode: "not-a-real-mode" }));
  assert.throws(() => new AccountStore(directory), /Invalid local account/);
});
