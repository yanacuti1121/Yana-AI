'use strict';
// Yana Missions — file-backed mission store (.yana/missions.json).
//
// A mission is created from a goal, classified by the YAMTAM router
// (simple/complex/external → owner + starter tasks), then planned in detail
// by the LLM from the UI ("Plan with Yana" calls /api/chat and PATCHes the
// task list back here). Progress is always computed from task states —
// never stored, so it can't drift.

const fs   = require('fs');
const path = require('path');

// Same persistent data dir as auth.js — YANA_DATA_DIR points at a mounted
// volume (e.g. /data on Railway) so missions survive redeploys.
const DATA_DIR = process.env.YANA_DATA_DIR || path.join(__dirname, '.yana');
const FILE     = path.join(DATA_DIR, 'missions.json');
const MAX_MISSIONS = 200;
const MAX_TASKS    = 30;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return []; }
}

function save(missions) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(missions, null, 2));
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function progress(m) {
  if (!m.tasks.length) return 0;
  const done = m.tasks.filter(t => t.state === 'done').length;
  return Math.round((done / m.tasks.length) * 100);
}

function withProgress(m) {
  return { ...m, progress: progress(m) };
}

function sanitizeTasks(tasks) {
  if (!Array.isArray(tasks)) return null;
  const STATES = new Set(['queued', 'active', 'done']);
  return tasks.slice(0, MAX_TASKS).map(t => ({
    name:  String(t.name  || '').slice(0, 200),
    agent: String(t.agent || 'Navigator').slice(0, 60),
    state: STATES.has(t.state) ? t.state : 'queued',
  })).filter(t => t.name);
}

// ── Handlers (routeFn = yamtam-core route(), injected by server.js) ──────────
function handleList(req, res) {
  json(res, 200, { missions: load().map(withProgress) });
}

async function handleCreate(req, res, body, routeFn) {
  const name = body && typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) { json(res, 400, { error: 'Missing mission name' }); return; }

  const missions = load();
  if (missions.length >= MAX_MISSIONS) { json(res, 409, { error: 'Mission limit reached' }); return; }

  // Classify the goal so the mission starts with an honest route decision
  let decision = null;
  try { decision = await routeFn(name); } catch (_) {}

  const mission = {
    id:      'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    owner:   'Navigator',
    status:  'planning',
    route:   decision ? decision.route : null,
    skill:   (decision && decision.suggested_skill) || null,
    created: new Date().toISOString(),
    tasks: [
      { name: 'Understand the goal',            agent: 'Navigator', state: 'done'   },
      { name: 'Plan tasks (use "Plan with Yana" or add your own)', agent: 'Navigator', state: 'active' },
    ],
  };
  missions.unshift(mission);
  save(missions);
  json(res, 200, { mission: withProgress(mission) });
}

function handleUpdate(req, res, body) {
  const id = body && body.id;
  if (!id) { json(res, 400, { error: 'Missing id' }); return; }

  const missions = load();
  const m = missions.find(x => x.id === id);
  if (!m) { json(res, 404, { error: 'Mission not found' }); return; }

  if (typeof body.name === 'string' && body.name.trim()) m.name = body.name.trim().slice(0, 200);
  if (['planning', 'active', 'done'].includes(body.status)) m.status = body.status;
  const tasks = sanitizeTasks(body.tasks);
  if (tasks && tasks.length) m.tasks = tasks;

  // All tasks done → mission done; any active task on a done mission → active
  if (m.tasks.length && m.tasks.every(t => t.state === 'done')) m.status = 'done';
  else if (m.status === 'done') m.status = 'active';

  save(missions);
  json(res, 200, { mission: withProgress(m) });
}

function handleDelete(req, res, body) {
  const id = body && body.id;
  if (!id) { json(res, 400, { error: 'Missing id' }); return; }
  const missions = load();
  const next = missions.filter(x => x.id !== id);
  if (next.length === missions.length) { json(res, 404, { error: 'Mission not found' }); return; }
  save(next);
  json(res, 200, { ok: true });
}

module.exports = { handleList, handleCreate, handleUpdate, handleDelete };
