# OAuth audit and implementation contract

Audit date: 2026-09-06. Working checkout: 722a3afa; newer implementation
inspected from origin/main snapshot 31eda0bd in /private/tmp/yana-studio-runtime.
This is a source audit, not an assertion about deployed configuration or secrets.

## Findings

- Current checkout predates connector OAuth. Its tools/yana-web/auth.js stores
  scrypt password hashes and bearer web sessions in .yana JSON. Do not migrate
  these sessions into desktop integration credentials.
- Newer auth.js already requests only openid/email/profile for Google login.
  Preserve this separation; Google login is NOT Gmail authorization.
- Newer connector-oauth.js, github-oauth.js, slack-oauth.js and notion-oauth.js
  have separate exchange/pending/poll/refresh implementations. Pending polling
  returns token bundles to renderer hooks (e.g. use-google-connector.js:73).
- desktop-src/lib/connector-credentials.mjs decrypts bundles in the renderer.
  YanaVault uses encrypted localStorage plus IndexedDB WebCrypto key, not OS
  Keychain. Encryption at rest does not remove renderer token ownership.
- lib/oauth-pending-store.js provides random, expiring, one-time state already;
  its consume-once pattern is retained, not its token-to-renderer handoff.
- Slack currently discards refresh_token and models team name as email;
  Notion similarly overloads email with workspace name. Preserve typed metadata.
- Some provider exchange exceptions include remote error_description. New
  infrastructure emits fixed error categories, never remote error bodies.
- src/os/credential.rs is presence-only inventory, not a token CRUD store.
- Studio API keys already use Electron safeStorage in main. Keep their store
  and profile schema unchanged. OAuth uses an independent encrypted store.

## Architecture / files

UI Connections → narrow IPC → IntegrationManager → provider adapter → system
browser → bounded loopback callback → main-only OS-encrypted token store.

- host/integrations/store.cjs: safeStorage abstraction, fail closed on basic_text.
- host/integrations/callback.cjs: state/PKCE/timeout/single-consumption.
- host/integrations/providers.cjs: provider differences, fixed endpoints/scopes.
- host/integrations/manager.cjs: isolation, refresh, cancellation, disconnect.
- renderer/Connections.tsx: metadata-only UI; no token getter in preload.
- host/main.cjs, host/preload.cjs, renderer/types.ts and Settings.tsx: integration.
- test/oauth.test.cjs: deterministic protocol and storage regression tests.

Authentication and authorization have separate connection keys, e.g.
google:identity and google:gmail. Connecting identity creates only a local
account connection, not a remote Yana server session. No mandatory login.

## Deployment prerequisites / no fabricated compatibility

Google native loopback requires a Desktop OAuth client; provided client ID's
type cannot be inferred from its suffix. Explicit confirmation required.
GitHub now uses the documented public device flow, with a configurable client ID
and device-flow enablement required in GitHub settings. No client secret is used.
Notion confidential-client secrets must NOT be shipped inside the app and require
a trusted token broker. Slack PKCE requires the Slack application setting to allow it and an
accepted redirect URI. Unsupported registration remains visibly unconfigured.
No secrets are requested in chat or loaded from legacy .env automatically.

Provider references: Google native-app OAuth documentation; GitHub Authorizing
OAuth apps; Slack Using PKCE; Notion Authorization. Provider capability support
must be verified rather than assumed identical. Notion requires a broker before
production enablement. Real provider consent and packaged macOS are separate
acceptance gates, not proven by fixture tests.

17-screen product expansion remains separate: no placeholder pages counted as
features. This change prioritizes the credential boundary, not a false claim
that every connector resource/action and every designed screen is complete.
