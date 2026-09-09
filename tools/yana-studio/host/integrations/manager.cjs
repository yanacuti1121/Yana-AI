const { callbackFlow } = require("./callback.cjs");
const { definitions, providers } = require("./providers.cjs");
const { GitHubDeviceProvider } = require("./github-device.cjs");

class IntegrationManager {
  constructor({
    store,
    browser,
    adapters = providers(),
    catalog = definitions,
    callback = callbackFlow,
    changed = () => {},
  }) {
    this.store = store;
    this.browser = browser;
    this.adapters = adapters;
    this.catalog = catalog.map((entry) => ({ ...entry }));
    this.callback = callback;
    this.changed = changed;
    this.pending = new Map();
    this.refreshing = new Map();
    this.revisions = new Map();
    this.errors = new Map();
    try {
      const config = this.store.read("github:configuration");
      if (config?.connection.client_id)
        this.enableGithub(config.connection.client_id);
    } catch {}
  }
  enableGithub(clientId) {
    this.adapters.set("github", new GitHubDeviceProvider(clientId));
    const entry = this.definition("github:account");
    entry.enabled = true;
    entry.setup =
      "GitHub OAuth app phải bật Device flow. Scope hiện tại chỉ đọc hồ sơ, chưa cấp quyền repository.";
  }
  configureGithub(clientId) {
    new GitHubDeviceProvider(clientId);
    if (
      this.pending.has("github:account") ||
      this.refreshing.has("github:account")
    )
      throw new Error("connection_in_progress");
    if (this.store.read("github:account"))
      throw new Error("disconnect_before_changing_client");
    this.store.write("github:configuration", {
      tokens: {},
      connection: { client_id: clientId },
    });
    this.enableGithub(clientId);
    this.changed();
    return this.list();
  }
  definition(key) {
    const entry = this.catalog.find((item) => item.key === key);
    if (!entry) throw new Error("unknown_connection");
    return entry;
  }
  list() {
    return this.catalog.map((entry) => {
      let saved;
      let problem = this.errors.get(entry.key) || "";
      try {
        saved = this.store.read(entry.key);
      } catch {
        problem = "secure_storage_unavailable";
      }
      return {
        ...entry,
        ...(saved?.connection || {}),
        status: this.pending.has(entry.key)
          ? "connecting"
          : problem
            ? "reconnect_required"
            : !saved
              ? "not_connected"
              : saved.connection.expires_at &&
                  saved.connection.expires_at <= Date.now()
                ? "expired"
                : "connected",
        error: problem,
        user_code: this.pending.get(entry.key)?.userCode || null,
        secure_storage: this.store.available(),
      };
    });
  }
  async connect(key) {
    const entry = this.definition(key);
    if (!entry.enabled) throw new Error("provider_registration_required");
    if (!this.store.available()) throw new Error("secure_storage_unavailable");
    if (this.pending.has(key)) throw new Error("connection_in_progress");
    this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
    const revision = this.revisions.get(key);
    const operation = {
      cancelled: false,
      flow: null,
      controller: new AbortController(),
    };
    this.pending.set(key, operation);
    this.errors.delete(key);
    this.changed();
    try {
      const adapter = this.adapters.get(entry.provider);
      let tokens;
      if (adapter.authorizeDevice) {
        tokens = await adapter.authorizeDevice({
          scopes: entry.scopes,
          browser: this.browser,
          signal: operation.controller.signal,
          announce: (code) => {
            operation.userCode = code;
            this.changed();
          },
        });
      } else {
        operation.flow = await this.callback();
        if (operation.cancelled) {
          operation.flow.cancel();
          throw new Error("user_cancelled");
        }
        const url = adapter.authorization(operation.flow, entry.scopes);
        await this.browser(url);
        const code = await operation.flow.result;
        tokens = await adapter.exchange(code, operation.flow);
      }
      if (operation.cancelled) throw new Error("user_cancelled");
      if (typeof tokens.access_token !== "string" || !tokens.access_token)
        throw new Error("invalid_token_response");
      const identity = await adapter.identity(tokens);
      if (operation.cancelled) throw new Error("user_cancelled");
      const scopes =
        typeof tokens.scope === "string"
          ? tokens.scope.split(/[,\s]+/).filter(Boolean)
          : entry.scopes;
      const aliases = {
        profile: "https://www.googleapis.com/auth/userinfo.profile",
        email: "https://www.googleapis.com/auth/userinfo.email",
      };
      if (
        !entry.scopes.every(
          (scope) => scopes.includes(scope) || scopes.includes(aliases[scope]),
        )
      )
        throw new Error("required_scope_missing");
      const now = Date.now();
      const lifetime =
        tokens.expires_in === undefined ? null : Number(tokens.expires_in);
      if (lifetime !== null && (!Number.isFinite(lifetime) || lifetime <= 0))
        throw new Error("invalid_token_response");
      this.store.write(key, {
        tokens,
        connection: {
          provider: entry.provider,
          ...identity,
          scopes,
          expires_at: lifetime === null ? null : now + lifetime * 1000,
          created_at: now,
          updated_at: now,
          credential_ref: key,
        },
      });
    } catch (error) {
      const allowed = [
        "user_cancelled",
        "authorization_denied",
        "callback_timeout",
        "authorization_revoked",
        "required_scope_missing",
      ];
      if (this.revisions.get(key) === revision)
        this.errors.set(
          key,
          allowed.includes(error.message) ? error.message : "connection_failed",
        );
    } finally {
      operation.flow?.cancel();
      if (this.pending.get(key) === operation) this.pending.delete(key);
      this.changed();
    }
    return this.list();
  }
  cancel(key) {
    this.definition(key);
    const operation = this.pending.get(key);
    if (operation) {
      operation.cancelled = true;
      operation.controller.abort();
      operation.flow?.cancel();
    }
  }
  async accessToken(key) {
    this.definition(key);
    if (this.pending.has(key)) throw new Error("connection_in_progress");
    const saved = this.store.read(key);
    if (!saved) throw new Error("not_connected");
    if (
      !saved.connection.expires_at ||
      saved.connection.expires_at > Date.now() + 60000
    )
      return saved.tokens.access_token;
    if (!this.refreshing.has(key)) {
      const revision = this.revisions.get(key) || 0;
      const work = (async () => {
        try {
          if (!saved.tokens.refresh_token) throw new Error();
          const adapter = this.adapters.get(saved.connection.provider);
          const fresh = await adapter.refresh(saved.tokens);
          if (
            !fresh.access_token ||
            !fresh.expires_in ||
            !Number.isFinite(Number(fresh.expires_in)) ||
            Number(fresh.expires_in) <= 0
          )
            throw new Error();
          if ((this.revisions.get(key) || 0) !== revision) throw new Error();
          this.store.write(key, {
            tokens: { ...saved.tokens, ...fresh },
            connection: {
              ...saved.connection,
              updated_at: Date.now(),
              expires_at: Date.now() + Number(fresh.expires_in) * 1000,
            },
          });
          this.errors.delete(key);
          return fresh.access_token;
        } catch {
          if ((this.revisions.get(key) || 0) === revision)
            this.errors.set(key, "reconnect_required");
          throw new Error("reconnect_required");
        } finally {
          this.changed();
        }
      })();
      this.refreshing.set(key, work);
      work.finally(() => this.refreshing.delete(key)).catch(() => {});
    }
    return this.refreshing.get(key);
  }
  disconnect(key) {
    this.definition(key);
    this.cancel(key);
    this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
    this.store.delete(key);
    this.errors.delete(key);
    this.changed();
    return this.list();
  }
  async revoke(key) {
    const entry = this.definition(key);
    const saved = this.store.read(key);
    if (!saved) throw new Error("not_connected");
    const adapter = this.adapters.get(entry.provider);
    if (!adapter.revoke) throw new Error("revoke_at_provider");
    await adapter.revoke(saved.tokens);
    for (const related of this.catalog.filter(
      (item) => item.provider === entry.provider,
    ))
      this.disconnect(related.key);
    return this.list();
  }
  dispose() {
    for (const key of this.pending.keys()) this.cancel(key);
  }
}
module.exports = { IntegrationManager };
