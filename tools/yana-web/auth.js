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

const DATA_DIR      = path.join(__dirname, '.yana');   // dot-dir: static server never serves it
const AUTH_FILE     = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const COOKIE        = 'yana_sid';
const SESSION_TTL   = 7 * 24 * 3600 * 1000;            // 7 days
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
function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { created: Date.now() };
  pruneSessions();
  saveJson(SESSIONS_FILE, sessions);
  return token;
}

function pruneSessions() {
  const now = Date.now();
  for (const [t, s] of Object.entries(sessions)) {
    if (now - s.created > SESSION_TTL) delete sessions[t];
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
  if (Date.now() - sessions[token].created > SESSION_TTL) {
    delete sessions[token];
    saveJson(SESSIONS_FILE, sessions);
    return false;
  }
  return true;
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// ── Rate limit (login only — stricter than the global POST limiter) ──────────
function loginRateLimited(req) {
  const ip  = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
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
  json(res, 200, { setup: isSetUp(), authed: isAuthed(req) });
}

// First run only: create the password, then sign in.
function handleSetup(req, res, body) {
  if (isSetUp()) { json(res, 409, { error: 'Already set up' }); return; }
  const password = body && body.password;
  if (typeof password !== 'string' || password.length < 6) {
    json(res, 400, { error: 'Password must be at least 6 characters' }); return;
  }
  saveJson(AUTH_FILE, { ...hashPassword(password), created: new Date().toISOString() });
  setCookie(res, createSession());
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
  if (typeof password !== 'string' || !verifyPassword(password, rec)) {
    json(res, 401, { error: 'Wrong password' }); return;
  }
  setCookie(res, createSession());
  json(res, 200, { ok: true });
}

function handleLogout(req, res) {
  const token = sessionToken(req);
  if (token && sessions[token]) {
    delete sessions[token];
    saveJson(SESSIONS_FILE, sessions);
  }
  clearCookie(res);
  json(res, 200, { ok: true });
}

module.exports = { isAuthed, isSetUp, handleStatus, handleSetup, handleLogin, handleLogout };
