async function requestJson(url, options = {}, acceptedErrors = []) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: options.signal || AbortSignal.timeout(15000),
    });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(Buffer.from(value));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const data = raw ? JSON.parse(raw) : {};
    if (response.ok && acceptedErrors.includes(data.error))
      return { error: data.error };
    if (!response.ok || data.error || data.ok === false) {
      const expired =
        response.status === 401 ||
        data.error === "invalid_grant" ||
        data.error === "token_revoked";
      console.error(
        `[integrations] ${url} responded ${response.status}: ${data.error || "(no error field)"} ${data.error_description || ""}`,
      );
      throw new Error(
        expired ? "authorization_revoked" : "provider_request_failed",
      );
    }
    return data;
  } catch (error) {
    if (
      error.message !== "authorization_revoked" &&
      error.message !== "provider_request_failed"
    )
      console.error(`[integrations] ${url} request threw:`, error);
    throw new Error(
      error.message === "authorization_revoked"
        ? "authorization_revoked"
        : "provider_request_failed",
    );
  }
}
const GOOGLE_CLIENT =
  "185309186279-o4uhmptdte7nvhbsdj96r84bahtnu35k.apps.googleusercontent.com";
// Google's token endpoint rejects a Desktop-app token/refresh request with
// "invalid_request: client_secret is missing" even with a correct PKCE
// code_verifier -- confirmed live (stage-by-stage log showed authorize,
// callback, and code_received all succeeding, only exchange failing on
// this). Google's own native-app guide includes client_secret in the
// Desktop-app token request too; unlike a Web-application secret, Google
// documents this one as not needing to stay confidential, since Desktop
// clients ship it in distributed source. It still isn't committed to this
// repo (GitHub's push protection rejects that regardless of Google's own
// stance): `scripts/write-secrets.cjs` writes the gitignored
// integrations/secrets.local.cjs from YANA_GOOGLE_CLIENT_SECRET at build
// time, and electron-builder's extraResources copies it to
// Resources/secrets.local.cjs in the packaged app (electron-builder
// silently drops gitignored files matched only via the "files" glob, so
// extraResources -- the same mechanism COMMANDS.md needed -- is required
// here too). Tries the packaged Resources path first, then the dev-mode
// relative path, then falls back to reading the env var directly.
let GOOGLE_CLIENT_SECRET = process.env.YANA_GOOGLE_CLIENT_SECRET || null;
for (const candidate of [
  process.resourcesPath &&
    require("node:path").join(process.resourcesPath, "secrets.local.cjs"),
  "./secrets.local.cjs",
].filter(Boolean)) {
  try {
    GOOGLE_CLIENT_SECRET = require(candidate).googleClientSecret;
    break;
  } catch {}
}
class GoogleOAuthProvider {
  constructor(
    clientId = GOOGLE_CLIENT,
    request = requestJson,
    clientSecret = GOOGLE_CLIENT_SECRET,
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.request = request;
    this.id = "google";
  }
  authorization(flow, scopes) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: flow.redirectUri,
      response_type: "code",
      state: flow.state,
      code_challenge: flow.challenge,
      code_challenge_method: "S256",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
    }).toString();
    return url.href;
  }
  async exchange(code, flow) {
    const fields = {
      client_id: this.clientId,
      code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.verifier,
      grant_type: "authorization_code",
    };
    if (this.clientSecret) fields.client_secret = this.clientSecret;
    return this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams(fields),
    });
  }
  async refresh(tokens) {
    const fields = {
      client_id: this.clientId,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    };
    if (this.clientSecret) fields.client_secret = this.clientSecret;
    return this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams(fields),
    });
  }
  async identity(tokens) {
    const data = await this.request(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    if (typeof data.sub !== "string") throw new Error("identity_unavailable");
    return {
      account_id: data.sub,
      email: typeof data.email === "string" ? data.email.slice(0, 320) : "",
      display_name: String(data.name || data.email || data.sub).slice(0, 256),
    };
  }
  async revoke(tokens) {
    await this.request("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      body: new URLSearchParams({
        token: tokens.refresh_token || tokens.access_token,
      }),
    });
  }
}
class GitHubOAuthProvider {
  constructor(config = {}, request = requestJson) {
    this.id = "github";
    this.config = config;
    this.request = request;
  }
  authorization(flow, scopes) {
    if (!this.config.clientId || !this.config.clientSecret)
      throw new Error("provider_registration_required");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: flow.redirectUri,
      scope: scopes.join(" "),
      state: flow.state,
      code_challenge: flow.challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  }
  exchange(code, flow) {
    return this.request("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: flow.verifier,
        redirect_uri: flow.redirectUri,
      }),
    });
  }
  async identity(tokens) {
    const data = await this.request("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Yana-Studio",
      },
    });
    if (!data.id) throw new Error("identity_unavailable");
    return {
      account_id: String(data.id),
      display_name: String(data.login).slice(0, 256),
    };
  }
  refresh() {
    throw new Error("reconnect_required");
  }
}
class SlackOAuthProvider {
  constructor(config = {}, request = requestJson) {
    this.id = "slack";
    this.config = config;
    this.request = request;
  }
  authorization(flow, scopes) {
    if (
      !this.config.clientId ||
      !this.config.pkceEnabled ||
      !flow.redirectUri.startsWith("https://")
    )
      throw new Error("provider_registration_required");
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: flow.redirectUri,
      scope: scopes.join(","),
      state: flow.state,
      code_challenge: flow.challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  }
  exchange(code, flow) {
    return this.request("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.config.clientId,
        code,
        code_verifier: flow.verifier,
        redirect_uri: flow.redirectUri,
      }),
    });
  }
  refresh(tokens) {
    return this.request("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.config.clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      }),
    });
  }
  async identity(tokens) {
    if (!tokens.team?.id) throw new Error("identity_unavailable");
    return {
      account_id: tokens.team.id,
      display_name: String(tokens.team.name || tokens.team.id).slice(0, 256),
      team_id: tokens.team.id,
      bot_id: tokens.bot_user_id || null,
    };
  }
  revoke(tokens) {
    return this.request("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  }
}
class NotionOAuthProvider {
  constructor(config = {}, request = requestJson) {
    this.id = "notion";
    this.config = config;
    this.request = request;
  }
  authorization(flow) {
    if (
      !this.config.clientId ||
      !this.config.clientSecret ||
      !flow.redirectUri.startsWith("https://")
    )
      throw new Error("provider_registration_required");
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: flow.redirectUri,
      response_type: "code",
      owner: "user",
      state: flow.state,
    }).toString();
    return url.href;
  }
  token(body) {
    return this.request("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });
  }
  exchange(code, flow) {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: flow.redirectUri,
    });
  }
  refresh(tokens) {
    return this.token({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
  }
  async identity(tokens) {
    if (!tokens.workspace_id || !tokens.bot_id)
      throw new Error("identity_unavailable");
    return {
      account_id: tokens.workspace_id,
      display_name: String(tokens.workspace_name || tokens.workspace_id).slice(
        0,
        256,
      ),
      workspace_id: tokens.workspace_id,
      bot_id: tokens.bot_id,
    };
  }
}

const definitions = [
  {
    key: "google:identity",
    provider: "google",
    name: "Google Account",
    purpose: "authentication",
    scopes: ["openid", "profile", "email"],
    enabled: true,
  },
  {
    key: "google:gmail",
    provider: "google",
    name: "Gmail",
    purpose: "integration",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    enabled: true,
  },
  {
    key: "github:account",
    provider: "github",
    name: "GitHub",
    purpose: "authentication",
    scopes: ["read:user"],
    enabled: false,
    setup:
      "Cần GitHub OAuth app bật Device flow. Chỉ dùng để nhận diện hồ sơ, không có quyền repository.",
  },
  {
    key: "github:repositories",
    provider: "github",
    name: "GitHub repositories",
    purpose: "integration",
    scopes: ["repo"],
    enabled: false,
    setup:
      "Kết nối riêng cho repository. GitHub sẽ yêu cầu quyền repo khi anh chủ động bấm Connect.",
  },
  {
    key: "slack:workspace",
    provider: "slack",
    name: "Slack",
    purpose: "integration",
    scopes: ["channels:read"],
    enabled: false,
    setup: "Cần Slack app bật PKCE và callback được Slack chấp nhận.",
  },
  {
    key: "notion:workspace",
    provider: "notion",
    name: "Notion",
    purpose: "integration",
    scopes: [],
    enabled: false,
    setup:
      "Cần trusted token broker cho confidential OAuth client; quyền page do Notion cấp.",
  },
];
function providers() {
  return new Map(
    [
      new GoogleOAuthProvider(),
      new GitHubOAuthProvider(),
      new SlackOAuthProvider(),
      new NotionOAuthProvider(),
    ].map((provider) => [provider.id, provider]),
  );
}
module.exports = {
  definitions,
  providers,
  GoogleOAuthProvider,
  GitHubOAuthProvider,
  SlackOAuthProvider,
  NotionOAuthProvider,
  requestJson,
};
