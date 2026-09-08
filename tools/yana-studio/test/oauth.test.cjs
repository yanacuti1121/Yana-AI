const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { callbackFlow, pkce } = require("../host/integrations/callback.cjs");
const { SecureTokenStore } = require("../host/integrations/store.cjs");
const { IntegrationManager } = require("../host/integrations/manager.cjs");
const {
  GoogleOAuthProvider,
  SlackOAuthProvider,
  NotionOAuthProvider,
  definitions,
} = require("../host/integrations/providers.cjs");

test("PKCE uses unique S256 verifier and login excludes mail scopes", () => {
  const proof = pkce();
  assert.equal(proof.verifier.length, 43);
  assert.equal(
    proof.challenge,
    crypto.createHash("sha256").update(proof.verifier).digest("base64url"),
  );
  assert.notEqual(proof.verifier, pkce().verifier);
  const provider = new GoogleOAuthProvider();
  const url = new URL(
    provider.authorization(
      {
        ...proof,
        state: "state",
        redirectUri: "http://127.0.0.1:3456/oauth/callback",
      },
      definitions[0].scopes,
    ),
  );
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("code_verifier"), false);
});
test("loopback validates state without consuming a valid pending request", async () => {
  const flow = await callbackFlow();
  try {
    const bad = await fetch(
      flow.redirectUri + "?state=" + "é".repeat(43) + "&code=private-code",
    );
    assert.equal(bad.status, 400);
    const good = await fetch(
      flow.redirectUri + `?state=${flow.state}&code=private-code`,
    );
    assert.equal(await flow.result, "private-code");
    assert.doesNotMatch(await good.text(), /private-code/);
    await assert.rejects(
      fetch(flow.redirectUri + `?state=${flow.state}&code=again`),
    );
  } finally {
    flow.cancel();
  }
});
test("callback timeout and cancellation settle and close listener", async () => {
  const expired = await callbackFlow({ timeout: 10 });
  await assert.rejects(expired.result, /callback_timeout/);
  const cancelled = await callbackFlow();
  cancelled.cancel();
  await assert.rejects(cancelled.result, /user_cancelled/);
});
test("denied consent returns fixed error, not provider description", async () => {
  const flow = await callbackFlow();
  await fetch(
    flow.redirectUri +
      `?state=${flow.state}&error=access_denied&error_description=SECRET`,
  );
  await assert.rejects(flow.result, /^Error: authorization_denied$/);
});
function memory() {
  const values = new Map();
  return {
    available: () => true,
    read: (key) => values.get(key),
    write: (key, value) => values.set(key, value),
    delete: (key) => values.delete(key),
  };
}
function fixture(overrides = {}) {
  const store = memory();
  const adapter = {
    authorization: () => "https://accounts.google.com/o/oauth2/v2/auth",
    exchange: async () => ({
      access_token: "PRIVATE",
      refresh_token: "REFRESH",
      expires_in: 3600,
    }),
    identity: async () => ({
      account_id: "account",
      display_name: "Test account",
    }),
    refresh: async () => ({ access_token: "NEW", expires_in: 3600 }),
    ...overrides,
  };
  const manager = new IntegrationManager({
    store,
    browser: async () => {},
    adapters: new Map([["google", adapter]]),
    callback: async () => ({ result: Promise.resolve("CODE"), cancel() {} }),
  });
  return { manager, store, adapter };
}
test("login and Gmail have isolated credentials and metadata contains no token", async () => {
  const { manager, store } = fixture();
  await manager.connect("google:identity");
  assert.equal(store.read("google:gmail"), undefined);
  await manager.connect("google:gmail");
  assert.doesNotMatch(
    JSON.stringify(manager.list()),
    /PRIVATE|REFRESH|access_token/,
  );
  manager.disconnect("google:identity");
  assert.equal(store.read("google:identity"), undefined);
  assert.ok(store.read("google:gmail"));
});
test("expired token refreshes once for concurrent main-process callers", async () => {
  let calls = 0;
  const { manager, store } = fixture({
    refresh: async () => {
      calls++;
      return { access_token: "FRESH", expires_in: 3600 };
    },
  });
  await manager.connect("google:identity");
  store.read("google:identity").connection.expires_at = 1;
  assert.equal(manager.list()[0].status, "expired");
  assert.deepEqual(
    await Promise.all([
      manager.accessToken("google:identity"),
      manager.accessToken("google:identity"),
    ]),
    ["FRESH", "FRESH"],
  );
  assert.equal(calls, 1);
});
test("refresh failure and revoked grant demand reconnect without leaking errors", async () => {
  const { manager, store } = fixture({
    refresh: async () => {
      throw new Error("authorization_revoked PRIVATE");
    },
  });
  await manager.connect("google:identity");
  store.read("google:identity").connection.expires_at = 1;
  await assert.rejects(
    manager.accessToken("google:identity"),
    /^Error: reconnect_required$/,
  );
  assert.equal(manager.list()[0].status, "reconnect_required");
  assert.doesNotMatch(JSON.stringify(manager.list()), /PRIVATE/);
});
test("disconnect during refresh cannot resurrect credentials", async () => {
  let release;
  const { manager, store } = fixture({
    refresh: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await manager.connect("google:identity");
  store.read("google:identity").connection.expires_at = 1;
  const pending = manager.accessToken("google:identity");
  manager.disconnect("google:identity");
  release({ access_token: "TOO_LATE", expires_in: 3600 });
  await assert.rejects(pending);
  assert.equal(store.read("google:identity"), undefined);
});
test("cancellation during exchange prevents credential persistence", async () => {
  let release;
  const { manager, store } = fixture({
    exchange: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = manager.connect("google:identity");
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  manager.cancel("google:identity");
  release({ access_token: "PRIVATE" });
  await pending;
  assert.equal(store.read("google:identity"), undefined);
});
test("OS encrypted store fails closed and isolates credential namespaces", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-oauth-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  const secure = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(text), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString(data) {
      const cipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        data.subarray(0, 12),
      );
      cipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString();
    },
  };
  const store = new SecureTokenStore(directory, secure, "linux");
  store.write("google:identity", {
    tokens: { access_token: "PRIVATE" },
    connection: {},
  });
  assert.doesNotMatch(
    fs.readFileSync(store.location("google:identity")).toString(),
    /PRIVATE/,
  );
  assert.equal(store.read("google:identity").tokens.access_token, "PRIVATE");
  assert.equal(store.read("github:account"), null);
  secure.getSelectedStorageBackend = () => "basic_text";
  assert.throws(
    () => store.read("google:identity"),
    /secure_storage_unavailable/,
  );
  assert.throws(
    () => store.write("google:gmail", {}),
    /secure_storage_unavailable/,
  );
  store.delete("google:identity");
  assert.equal(fs.existsSync(store.location("google:identity")), false);
});
test("Slack and Notion keep workspace identity separate from email", async () => {
  const slack = await new SlackOAuthProvider().identity({
    team: { id: "T1", name: "Team" },
    bot_user_id: "B1",
  });
  const notion = await new NotionOAuthProvider().identity({
    workspace_id: "W1",
    workspace_name: "Workspace",
    bot_id: "B2",
  });
  assert.equal(slack.team_id, "T1");
  assert.equal(notion.workspace_id, "W1");
  assert.equal(slack.email, undefined);
  assert.equal(notion.email, undefined);
});
test("provider revoke cleans related Google credentials only after success", async () => {
  const { manager, store, adapter } = fixture({
    revoke: async () => {
      throw new Error("provider_request_failed");
    },
  });
  await manager.connect("google:identity");
  await manager.connect("google:gmail");
  await assert.rejects(manager.revoke("google:gmail"));
  assert.ok(store.read("google:gmail"));
  adapter.revoke = async () => {};
  await manager.revoke("google:gmail");
  assert.equal(store.read("google:identity"), undefined);
  assert.equal(store.read("google:gmail"), undefined);
});
test("GitHub public configuration enables device flow and preserves existing credentials", () => {
  const { manager, store } = fixture();
  assert.equal(manager.definition("github:account").enabled, false);
  manager.configureGithub("public-client-one");
  assert.equal(manager.definition("github:account").enabled, true);
  assert.equal(
    store.read("github:configuration").connection.client_id,
    "public-client-one",
  );
  const existing = {
    tokens: { access_token: "PRIVATE" },
    connection: { account_id: "123" },
  };
  store.write("github:account", existing);
  assert.throws(
    () => manager.configureGithub("public-client-two"),
    /disconnect_before/,
  );
  assert.equal(store.read("github:account"), existing);
  const restored = new IntegrationManager({ store, browser: async () => {} });
  assert.equal(restored.definition("github:account").enabled, true);
  assert.doesNotMatch(
    JSON.stringify(restored.list()),
    /PRIVATE|public-client-one/,
  );
});
