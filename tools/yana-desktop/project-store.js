'use strict';

const path = require('path');

const MAX_RECENT_PROJECTS = 20;

function normalizeStore(value) {
  const recent = Array.isArray(value?.recent) ? value.recent : [];
  const seen = new Set();
  return {
    version: 1,
    recent: recent.filter((item) => {
      if (!item || typeof item.root !== 'string' || !item.root || seen.has(item.root)) return false;
      seen.add(item.root);
      return true;
    }).slice(0, MAX_RECENT_PROJECTS).map((item) => ({
      root: item.root,
      name: typeof item.name === 'string' && item.name ? item.name : path.basename(item.root),
      lastOpenedAt: typeof item.lastOpenedAt === 'string' ? item.lastOpenedAt : null,
    })),
  };
}

function recordProject(store, root, now = new Date().toISOString()) {
  const normalized = normalizeStore(store);
  const entry = { root, name: path.basename(root) || root, lastOpenedAt: now };
  return {
    version: 1,
    recent: [entry, ...normalized.recent.filter((item) => item.root !== root)].slice(0, MAX_RECENT_PROJECTS),
  };
}

module.exports = { MAX_RECENT_PROJECTS, normalizeStore, recordProject };
