# Yana Studio — Identity, Authentication & Connector Lifecycle Audit

Requested after screenshots showed the Account page (local email/password +
"Continue with Google") and the Connections page (Google Account reporting
"reconnect required / connection failed", GitHub/Slack/Notion "not
connected") looking like an incomplete or internally-inconsistent system.
This audit maps the real implementation end to end before any code was
changed, per the brief's own instruction.

## 1. Current architecture

Three concepts the brief asked to be checked for conflation are, on
inspection, already implemented as genuinely separate systems:

| Concept | Implementation | File |
|---|---|---|
| **Local Studio Profile** | `AccountStore` — single local JSON file (`account-v1.json`), scrypt-hashed password with random salt, `timingSafeEqual` comparison, `mode: "local" \| "google"` | `host/account.cjs` |
| **Optional Sign-in Identity** | `google:identity` connector, `purpose: "authentication"`, scopes limited to `openid profile email` | `host/integrations/providers.cjs:287-293` |
| **Service Connectors** | `google:gmail`, `github:account`, `slack:workspace`, `notion:workspace` — each its own catalog entry, own scopes, own stored credential key, `purpose: "integration"` | `host/integrations/providers.cjs:294-334` |

`AccountSettings.tsx`'s "Continue with Google" (`accountUseGoogle`, line
~131) only copies display name/email/account_id from an **already
connected** `google:identity` into the local profile file — it does not
touch Gmail scope and does not grant anything new. The UI's own copy
("Đăng nhập Google không cấp quyền Gmail. Mỗi kết nối có quyền và
credential riêng") matches what the code actually does.

### End-to-end flow (Google, representative of all browser-based providers)

```
renderer/Connections.tsx  "Connect"
  -> window.studio.integrationConnect(key)            (preload)
  -> IntegrationManager.connect(key)                   host/integrations/manager.cjs:87
       -> GoogleOAuthProvider.authorization(flow, scopes)   providers.cjs
       -> callbackFlow(): loopback HTTP server, PKCE + state    host/integrations/callback.cjs
       -> system browser opens Google consent screen
       -> Google redirects to http://127.0.0.1:<port>/oauth/callback
       -> callback.cjs verifies state (timing-safe) + Host header + single-use
       -> adapter.exchange(code, flow)  -> POST oauth2.googleapis.com/token (PKCE verifier)
       -> adapter.identity(tokens)      -> GET openidconnect.googleapis.com/v1/userinfo
       -> store.write(key, {tokens, connection})   host/integrations/store.cjs:43
            -> Electron safeStorage.encryptString() -> OS Keychain-backed AES -> atomic file write
  -> manager.list() recomputed -> "integrations:update" IPC event -> renderer re-renders
```

GitHub, Slack and Notion reuse the **same** `IntegrationManager` /
`callbackFlow` / `SecureTokenStore` machinery; only each provider class's
`authorization()` / `exchange()` / `refresh()` / `identity()` / `revoke()`
differ (`providers.cjs`). GitHub additionally has a separate device-flow
path (`github-device.cjs`) used instead of the browser+callback path.

### State machine (per connector key)

Implemented via `IntegrationManager.list()`'s derived `status` field
(`manager.cjs:59-86`):

```
not_connected -> connecting -> connected -> expired -> (refresh) -> connected
                                    |                        \-> reconnect_required
                             (revoke/disconnect)
                                    v
                              not_connected
```

`connect()` is cancellable mid-flow (`cancel()` aborts the loopback server
and the pending authorization). `accessToken()` transparently refreshes an
expiring token and only surfaces `reconnect_required` when the refresh
itself fails (revoked grant, missing refresh token, or a decrypt failure —
see below).

## 2. Root causes for the two screenshots

**Google: "reconnect required / connection failed"** — `store.read()`
(`store.cjs:26-42`) wraps *any* failure decrypting the stored ciphertext
into a single `credential_store_unreadable` throw. Electron's
`safeStorage` on macOS backs onto an OS Keychain entry scoped to the app's
code signature. This session re-signed the packaged app with a new
`afterSign` hook as part of a separate signing fix (different
CodeDirectory than whichever earlier build originally stored that Google
credential) — a Keychain item written under one app signature commonly
becomes unreadable under a different one. **This is the most likely
explanation for this exact symptom appearing right after installing a
freshly re-signed build, not a logic bug in the OAuth code.** I could not
prove this live in this pass (would require connecting Google under one
signed build, reinstalling a re-signed build, and confirming the read
failure reproduces) — flagged as plausible, not proven.

Independently of that hypothesis, this failure path *was* a real bug on
its own: `manager.list()` collapsed every `store.read()` failure —
including this one — into the label `secure_storage_unavailable`, which is
actively misleading (secure storage works fine; only this one entry's
ciphertext doesn't). **Fixed** — see §3.

**GitHub / Slack / Notion: "not connected"** — not a bug. `definitions`
(`providers.cjs:307-334`) ships all three with `enabled: false`, and each
provider's `authorization()` independently guards on a missing
`clientId`/`clientSecret`. No OAuth app credentials exist for any of the
three in this repo. Each already carries a `setup` string explaining why
(`providers.cjs:313-333`, e.g. Slack: "Cần Slack app bật PKCE và callback
được Slack chấp nhận"), rendered in the UI (`Connections.tsx:42`), and the
Connect button is `disabled` whenever `!item.enabled`
(`Connections.tsx:121-125`) — this satisfies the brief's "no dead
UI"/"clearly marked unavailable" requirement as originally shipped, GitHub
additionally exposes a client-ID config form other two don't
(`Connections.tsx:43-77`) because GitHub supports a public OAuth client
(no secret required); Slack and Notion require a confidential client with
a trusted token broker Yana does not operate, which is a real
infrastructure prerequisite, not a missing feature to build client-side.

## 3. Flows repaired

1. **`IntegrationManager.revoke()` cascade bug** (`manager.cjs`, was
   lines 248-260). Revoking any key disconnected **every** catalog entry
   sharing that key's `provider` string — so revoking `google:gmail`
   silently signed the user out of the separate `google:identity`
   connection too, even though `google:identity` and `google:gmail` are
   independent `authorization()`/`exchange()` round trips holding
   independent tokens, and revoking Gmail's token at Google never revokes
   the identity token. This directly contradicted the UI's own stated
   promise ("mỗi kết nối có quyền và credential riêng"). Fixed to
   `disconnect(key)` only the key actually revoked. Test
   `test/oauth.test.cjs` ("provider revoke clears only the revoked key...")
   updated — it previously asserted the cascading behavior as correct.

2. **Opaque `reconnect_required` messaging.** `manager.list()` now
   distinguishes `credential_store_unreadable` (this entry's ciphertext
   can't be decrypted) from `secure_storage_unavailable` (secure storage
   itself isn't available on this OS) instead of collapsing both into the
   latter. `Connections.tsx` now shows a translated, actionable message
   ("Couldn't read the saved credential (often happens after an app
   update). Reconnect to restore it.") instead of the raw error code with
   underscores replaced by spaces. Added in all three locales
   (`renderer/i18n.ts`: `credentialStoreUnreadableNote`).

## 4. Reviewed, found already correct (no change made)

- **Lock vs. Log out.** `AccountSettings.tsx` already exposes two
  distinct, correctly-scoped actions for `mode === "local"`: "Lock Studio"
  (`accountLock()` -> `AccountStore.lock()`) keeps the profile file and
  only requires the password again, while "Log out" is a separate,
  `window.confirm`-gated destructive action that deletes the profile.
  Google-mode accounts only show "Log out" (there is no local password to
  re-lock with, so a lock button would be meaningless there). This matches
  the brief's "sign-out/unlink semantics where applicable" requirement as
  shipped; not a gap.

## 5. Secrets safety

No leak found. `IntegrationConnection` objects sent to the renderer
(`manager.list()`) only ever include `connection` fields (account_id,
email, display_name, scopes, status, error) — `tokens` is never included
in what crosses the IPC boundary. Storage is Electron `safeStorage`
(OS Keychain-backed AES) with atomic file writes, `0600`/`0700`
permissions, and symlink/oversized-file rejection on read
(`store.cjs:26-42`). No token values appear in any log statement in these
files.

## 6. Tests executed

- `npm test` (Node's built-in test runner, real — not mocked-away —
  loopback HTTP server, real PKCE, real crypto): **84/84 pass** (78
  pre-existing + 6 new).
- Added `test/account.test.cjs` (previously zero coverage for
  `AccountStore`): profile creation + input validation, password hashing
  (plaintext never on disk, only the exact password unlocks), lock/unlock
  cycle, **restart persistence** (a fresh `AccountStore` instance reading
  the same directory sees the same locked profile — brief's explicit
  requirement), logout deletion, Google-mode profile creation guarded on
  an already-connected identity, and a corrupted account file failing
  closed instead of silently resetting.
- Updated `test/oauth.test.cjs`'s revoke test to assert the corrected
  (non-cascading) behavior.
- `npm run build` (tsc --noEmit + vite build): clean.

## 7. Provider-specific prerequisites that cannot be completed locally

- **GitHub**: works once a user (or anh) registers a public GitHub OAuth
  App and enters its client ID in the existing config form — no code
  change needed, this is already wired.
- **Slack**: requires a Slack app with a confidential client secret. A
  packaged desktop app cannot hold a confidential secret safely, so this
  needs a small trusted token broker (a server anh would operate) before
  Slack can move past "not connected" — no amount of client-side code
  fixes this.
- **Notion**: same confidential-client constraint as Slack; same
  trusted-broker prerequisite.

## 8. Remaining limitations / could not confirm

- Whether the Keychain-signature-invalidation hypothesis (§2) is actually
  what happened to the specific Google connection in anh's screenshots —
  plausible from how `safeStorage` and Keychain ACLs work, and it lines up
  with re-signing having happened in this same session, but not
  reproduced live start-to-finish.
- Whether Google's live consent screen reliably returns a `refresh_token`
  on a repeat connect (`providers.cjs:63` correctly sets
  `prompt: "consent select_account"`, which should force one) — this
  needs a live OAuth round trip to confirm, not just static reading.
- This pass did not add a Slack/Notion trusted-token-broker (out of scope
  — that is new server infrastructure, not a bug in the existing client).
