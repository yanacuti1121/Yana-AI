'use strict';
// Yana Auth — single-user password gate for the local web UI.
//
// Password: scrypt hash (random salt, N=16384) in .yana/auth.json — never
// plaintext, never in env, never in a URL (rule 66 / api-security-gate API2).
// Sessions: random 256-bit tokens in an HttpOnly SameSite=Lax cookie,
// persisted to .yana/sessions.json so a server restart keeps you signed in.
// Login attempts are rate-limited per IP (5 per 15 min) — OWASP API6.

const crypto = require('crypto');
const fs     = require('fs');
const https  = require('https');
const path   = require('path');
const { writeJsonAtomic } = require('./lib/atomic-json');

// Persistent data dir. Default: dot-dir next to the server (static server never
// serves it). Override with YANA_DATA_DIR to point at a mounted volume
// (e.g. /data on Railway) so accounts survive redeploys.
const DATA_DIR      = process.env.YANA_DATA_DIR || path.join(__dirname, '.yana');
const AUTH_FILE     = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const COOKIE        = 'yana_sid';
const SESSION_TTL   = 7 * 24 * 3600 * 1000;            // 7 days (default)
const REMEMBER_TTL  = 30 * 24 * 3600 * 1000;           // 30 days ("remember me")
const SCRYPT        = { N: 16384, r: 8, p: 1, keylen: 64 };

const LOGIN_RATE = { windowMs: 15 * 60_000, max: 5, hits: new Map() };

let sessions = loadJson(SESSIONS_FILE) || {};

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function saveJson(file, data) {
  writeJsonAtomic(file, data);
}

// Atomic create-only write — throws EEXIST instead of overwriting. Used for
// account setup, where isSetUp()-then-writeFileSync would otherwise let two
// concurrent POST /api/auth/setup requests both pass the check before either
// writes, silently letting the second request's account overwrite the first.
function saveJsonExclusive(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(password, rec) {
  const expected = Buffer.from(rec.hash, 'hex');
  const actual   = crypto.scryptSync(password, Buffer.from(rec.salt, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

function isSetUp() {
  const rec = loadJson(AUTH_FILE);
  return !!(rec && ((rec.salt && rec.hash) || rec.google));
}

// ── Sessions ──────────────────────────────────────────────────────────────────
function createSession(remember) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { created: Date.now(), ttl: remember ? REMEMBER_TTL : SESSION_TTL };
  pruneSessions();
  saveJson(SESSIONS_FILE, sessions);
  return token;
}

function pruneSessions() {
  const now = Date.now();
  for (const [t, s] of Object.entries(sessions)) {
    if (now - s.created > (s.ttl || SESSION_TTL)) delete sessions[t];
  }
}

function sessionToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE && v) return v;
  }
  return null;
}

function isAuthed(req) {
  const token = sessionToken(req);
  if (!token || !sessions[token]) return false;
  const s = sessions[token];
  if (Date.now() - s.created > (s.ttl || SESSION_TTL)) {
    delete sessions[token];
    saveJson(SESSIONS_FILE, sessions);
    return false;
  }
  return true;
}

// req.secure is resolved by server.js (X-Forwarded-Proto behind a trusted
// proxy) — the Secure flag keeps the session cookie off plain-HTTP hops.
// SameSite=Strict, not Lax: this is a single-user local-app-style login, not
// something users reach via an external link that should carry the cookie
// on first cross-site navigation — server.js's Origin check (CSRF guard)
// already rejects cross-origin mutations, but Strict means the browser
// never attaches the cookie to a cross-site request in the first place,
// which also covers simple cross-site GETs Origin-checking doesn't gate.
function setCookie(req, res, token) {
  const ttl    = (sessions[token] && sessions[token].ttl) || SESSION_TTL;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl / 1000}${secure}`);
}

function clearCookie(req, res) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

// ── Rate limit (login only — stricter than the global POST limiter) ──────────
// hits Map only ever grew — no entry was ever removed once its window
// expired, just left stale (lazily overwritten only if that exact IP tried
// again). On a public deployment (Railway/Render/Cloudflare — this server
// does run there, see YANA_DATA_DIR above) with many distinct visitor IPs,
// that's slow unbounded growth for the life of the process. Prune expired
// entries opportunistically on each check (2026-07-08 audit fix) rather
// than adding a timer — cheap relative to the scrypt hashing this guards.
function pruneLoginRate(now) {
  for (const [ip, rec] of LOGIN_RATE.hits) {
    if (now - rec.start > LOGIN_RATE.windowMs) LOGIN_RATE.hits.delete(ip);
  }
}

function loginRateLimited(req) {
  // req.clientIp is the proxy-aware address resolved by server.js — without it
  // every visitor behind Railway's proxy would share one rate-limit bucket
  const ip  = req.clientIp || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  pruneLoginRate(now);
  let rec = LOGIN_RATE.hits.get(ip);
  if (!rec || now - rec.start > LOGIN_RATE.windowMs) rec = { count: 0, start: now };
  rec.count++;
  LOGIN_RATE.hits.set(ip, rec);
  return rec.count > LOGIN_RATE.max;
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handleStatus(req, res) {
  const rec = loadJson(AUTH_FILE);
  json(res, 200, {
    setup: isSetUp(),
    authed: isAuthed(req),
    // Account name is shown on the login screen (single-user local app) —
    // it is display data, not a secret.
    username: (rec && rec.username) || null,
    googleAvailable: googleConfigured(),
    googleLinked: !!(rec && rec.google),
  });
}

// Account names are compared NFC-normalized and case-insensitive so that
// Vietnamese IME composition differences never lock the owner out.
function normalizeUsername(name) {
  return String(name).normalize('NFC').trim();
}

function validUsername(name) {
  if (typeof name !== 'string') return false;
  const n = normalizeUsername(name);
  // 2–32 visible chars, no control characters
  return n.length >= 2 && n.length <= 32 && !/[\u0000-\u001f\u007f]/.test(n);
}

// First run only: create the account (username + password), then sign in.
// The isSetUp() precheck below is an early-exit for the common case only —
// it does NOT provide the actual race safety. Two concurrent requests can
// both pass it before either writes; saveJsonExclusive's atomic `wx` flag
// is what actually guarantees only the first write wins.
function handleSetup(req, res, body) {
  if (isSetUp()) { json(res, 409, { error: 'Already set up' }); return; }
  const username = body && body.username;
  const password = body && body.password;
  if (!validUsername(username)) {
    json(res, 400, { error: 'Username must be 2-32 characters' }); return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    json(res, 400, { error: 'Password must be at least 6 characters' }); return;
  }
  try {
    saveJsonExclusive(AUTH_FILE, {
      ...hashPassword(password),
      username: normalizeUsername(username),
      created: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === 'EEXIST') { json(res, 409, { error: 'Already set up' }); return; }
    throw err;
  }
  setCookie(req, res, createSession(!!body.remember));
  json(res, 200, { ok: true });
}

function handleLogin(req, res, body) {
  if (loginRateLimited(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '900' });
    res.end(JSON.stringify({ error: 'Too many attempts — wait 15 minutes' }));
    return;
  }
  const rec = loadJson(AUTH_FILE);
  if (!rec) { json(res, 409, { error: 'Not set up yet' }); return; }
  // An account created via "Sign in with Google" (see below) has no
  // salt/hash — verifyPassword would throw on it, not just fail cleanly.
  if (!rec.salt || !rec.hash) {
    json(res, 401, { error: 'This account has no password set — use Sign in with Google' }); return;
  }
  const password = body && body.password;
  // Accounts created before usernames existed have no rec.username — skip the
  // name check for them so the owner is never locked out by this upgrade.
  if (rec.username) {
    const given = body && body.username;
    if (typeof given !== 'string' ||
        normalizeUsername(given).toLowerCase() !== rec.username.toLowerCase()) {
      json(res, 401, { error: 'Wrong username or password' }); return;
    }
  }
  if (typeof password !== 'string' || !verifyPassword(password, rec)) {
    json(res, 401, { error: 'Wrong username or password' }); return;
  }
  setCookie(req, res, createSession(!!body.remember));
  json(res, 200, { ok: true });
}

function handleLogout(req, res) {
  const token = sessionToken(req);
  if (token && sessions[token]) {
    delete sessions[token];
    saveJson(SESSIONS_FILE, sessions);
  }
  clearCookie(req, res);
  json(res, 200, { ok: true });
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
// A second, optional way to sign in to the SAME single local account — this
// is still a single-user app, not multi-tenant. GOOGLE_OAUTH_CLIENT_ID/
// GOOGLE_OAUTH_CLIENT_SECRET come from tools/yana-web/.env.local (gitignored,
// never committed — rule 66/52). Neither configured -> googleConfigured() is
// false, the frontend simply never shows the button, every path above this
// comment is unaffected.
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const OAUTH_STATE_TTL_MS   = 5 * 60_000; // long enough for the Google redirect round-trip, no longer

function googleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

// State is tracked server-side (nonce -> {intent, expiresAt}), NOT in a
// cookie. Reason: main.js's guardNavigation/setWindowOpenHandler sends
// external URLs (accounts.google.com included) to the user's SYSTEM
// browser via shell.openExternal, not Electron's own webContents — by the
// time Google redirects back to our /callback, the request can land in a
// different browser/process than the one that hit /start, with a
// completely separate cookie jar (confirmed: cookie=null in production use,
// see the console.warn below). The nonce's own unguessability + one-time
// consumption is the actual CSRF protection; nothing about it depends on
// which browser makes either request.
const pendingOAuthStates = new Map();

function pruneOAuthStates() {
  const now = Date.now();
  for (const [nonce, rec] of pendingOAuthStates) {
    if (now > rec.expiresAt) pendingOAuthStates.delete(nonce);
  }
}

// "Desktop app" OAuth client type (NOT "Web application") accepts any
// loopback port per Google's own RFC 8252 support — required here because
// this server picks a fresh port on every launch (see server.js's PORT
// resolution); a fixed pre-registered redirect_uri would break on restart.
function googleRedirectUri(req) {
  const host = req.headers.host || '127.0.0.1';
  return `http://${host}/api/auth/google/callback`;
}

function redirectToLogin(res, reason) {
  res.writeHead(302, { Location: `/login.html?google_error=${encodeURIComponent(reason)}` });
  res.end();
}

function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const upReq = https.request(options, (upRes) => {
      let data = '';
      upRes.on('data', (c) => { data += c; });
      upRes.on('end', () => {
        try { resolve({ status: upRes.statusCode, body: JSON.parse(data) }); }
        catch (err) { reject(err); }
      });
    });
    upReq.on('error', reject);
    if (body) upReq.write(body);
    upReq.end();
  });
}

async function exchangeGoogleCode(code, redirectUri) {
  const body = new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  }).toString();
  const { status, body: tokenRes } = await httpsJson({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) },
  }, body);
  if (status !== 200 || !tokenRes.access_token) {
    // tokenRes.error / error_description are Google's own diagnostic text
    // (e.g. "redirect_uri_mismatch", "invalid_client") — never the secret,
    // safe to log and surface in the thrown message for the callback's
    // catch block to print.
    throw new Error(`token_exchange_failed status=${status} error=${tokenRes.error || '?'} desc=${tokenRes.error_description || '?'}`);
  }
  return tokenRes.access_token;
}

async function fetchGoogleProfile(accessToken) {
  const { status, body: profile } = await httpsJson({
    hostname: 'www.googleapis.com', path: '/oauth2/v3/userinfo', method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (status !== 200 || !profile.sub) throw new Error(`userinfo_failed status=${status} error=${profile.error || '?'}`);
  if (!profile.email_verified) throw new Error('email_not_verified');
  return { sub: profile.sub, email: profile.email };
}

// GET /api/auth/google/start?intent=login|link
function handleGoogleStart(req, res) {
  if (!googleConfigured()) { json(res, 404, { error: 'Google sign-in is not configured' }); return; }
  let intent = 'login';
  try {
    const q = new URL(req.url, 'http://internal').searchParams;
    if (q.get('intent') === 'link') intent = 'link';
  } catch (_) {}
  // Linking an existing account to a Google identity must only ever start
  // from an already-authenticated request — checked here, at /start, since
  // /callback has no reliable way to know which browser/session initiated
  // this (see pendingOAuthStates' comment above).
  if (intent === 'link' && !isAuthed(req)) {
    json(res, 401, { error: 'Sign in first to link a Google account' }); return;
  }

  pruneOAuthStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingOAuthStates.set(state, { intent, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}

// GET /api/auth/google/callback
async function handleGoogleCallback(req, res) {
  if (!googleConfigured()) { redirectToLogin(res, 'unavailable'); return; }

  let query;
  try { query = new URL(req.url, 'http://internal').searchParams; }
  catch (_) { redirectToLogin(res, 'bad_request'); return; }

  pruneOAuthStates();
  const stateParam = query.get('state');
  const pending = stateParam && pendingOAuthStates.get(stateParam);
  if (!pending) {
    console.warn('[auth/google] unknown or expired state param=%s', stateParam);
    redirectToLogin(res, 'state_mismatch'); return;
  }
  pendingOAuthStates.delete(stateParam); // one-time use
  const intent = pending.intent;
  const code = query.get('code');
  if (!code) { redirectToLogin(res, 'denied'); return; }

  let profile;
  try {
    const accessToken = await exchangeGoogleCode(code, googleRedirectUri(req));
    profile = await fetchGoogleProfile(accessToken);
  } catch (err) {
    console.error('[auth/google] callback failed:', err.message);
    redirectToLogin(res, 'google_failed'); return;
  }

  const rec = loadJson(AUTH_FILE);
  const googleField = { sub: profile.sub, email: profile.email, linkedAt: new Date().toISOString() };

  if (intent === 'link') {
    if (!rec) { redirectToLogin(res, 'not_set_up'); return; }
    saveJson(AUTH_FILE, { ...rec, google: googleField });
    res.writeHead(302, { Location: '/?google=linked' }); res.end();
    return;
  }

  // intent === 'login'
  const wasFirstRun = !rec; // used below to tell the client a fresh account
                            // was just provisioned, not a normal sign-in —
                            // see the redirect below and login.html's
                            // clearPreviousOwnerData() for why this matters.
  let finalRec = rec;
  if (!rec) {
    // First run via Google — provision the single local account with no
    // password. Same EEXIST race guard as handleSetup: if another request
    // (password setup, or a second concurrent Google login) won the race,
    // fall through to the "does the saved record match" check below instead
    // of overwriting whatever they just created.
    try {
      saveJsonExclusive(AUTH_FILE, {
        username: profile.email,
        google: googleField,
        created: new Date().toISOString(),
      });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    finalRec = loadJson(AUTH_FILE);
  } else if (!rec.google && rec.username &&
             normalizeUsername(rec.username).toLowerCase() === normalizeUsername(profile.email).toLowerCase()) {
    // Auto-link on first Google sign-in when the verified Google email
    // matches the account's own username — anh explicitly chose this
    // trade-off (single-user local app; the manual "link from Settings"
    // step below is still required for a username that does NOT match).
    finalRec = { ...rec, google: googleField };
    saveJson(AUTH_FILE, finalRec);
  }

  if (!finalRec || !finalRec.google || finalRec.google.sub !== profile.sub) {
    console.warn('[auth/google] login rejected: existing account not linked to this Google identity (email=%s)', profile.email);
    redirectToLogin(res, rec ? 'not_linked' : 'setup_race'); return;
  }
  setCookie(req, res, createSession(false));
  // ?google=first-run (only on a just-provisioned account, never a normal
  // returning-user login) tells the client to clear its stale localStorage
  // chat/profile cache from whatever account used this browser before —
  // see login.html's clearPreviousOwnerData() and its own comment.
  res.writeHead(302, { Location: wasFirstRun ? '/?google=first-run' : '/' }); res.end();
}

module.exports = {
  isAuthed, isSetUp, handleStatus, handleSetup, handleLogin, handleLogout,
  googleConfigured, handleGoogleStart, handleGoogleCallback,
};
