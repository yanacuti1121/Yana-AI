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
const path   = require('path');

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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
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
  return !!(rec && rec.salt && rec.hash);
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
function setCookie(req, res, token) {
  const ttl    = (sessions[token] && sessions[token].ttl) || SESSION_TTL;
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl / 1000}${secure}`);
}

function clearCookie(req, res) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
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
  saveJson(AUTH_FILE, {
    ...hashPassword(password),
    username: normalizeUsername(username),
    created: new Date().toISOString(),
  });
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

module.exports = { isAuthed, isSetUp, handleStatus, handleSetup, handleLogin, handleLogout };
