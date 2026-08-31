'use strict';

const fs = require('fs');
const path = require('path');

const PROTECTED_TOP_LEVEL = new Set(['.git', '.yana-ai']);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeRelativePath(relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0')) {
    return { ok: false, error: 'path must be a non-empty NUL-free string' };
  }
  if (path.isAbsolute(relPath)) return { ok: false, error: 'path must be relative to the current project' };

  const normalized = path.normalize(relPath);
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    return { ok: false, error: 'path is outside the current project' };
  }

  const topLevel = normalized.split(path.sep)[0];
  if (PROTECTED_TOP_LEVEL.has(topLevel)) {
    return { ok: false, error: `${topLevel} cannot be moved to Trash from Yana` };
  }
  return { ok: true, relPath: normalized };
}

// User-initiated, reversible filesystem operation for the Files workspace.
// This deliberately stays in Electron main rather than becoming an AI
// capability: an approved human action must never be confused with an agent
// mutation or be routable from the renderer to an arbitrary filesystem path.
async function trashFile({ repoRoot, relPath, trashItem, realpathSync = fs.realpathSync, lstatSync = fs.lstatSync }) {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized.ok) return normalized;

  let root;
  try {
    root = realpathSync(repoRoot);
  } catch (error) {
    return { ok: false, error: `could not resolve project root: ${error.message}` };
  }

  const requestedPath = path.resolve(root, normalized.relPath);
  if (!isInside(root, requestedPath)) return { ok: false, error: 'path is outside the current project' };

  let entry;
  try {
    entry = lstatSync(requestedPath);
  } catch (error) {
    return { ok: false, error: `file was not found: ${error.message}` };
  }
  if (entry.isSymbolicLink()) return { ok: false, error: 'symbolic links cannot be moved to Trash from Yana' };
  if (!entry.isFile()) return { ok: false, error: 'only regular files can be moved to Trash from Yana' };

  let resolvedPath;
  try {
    resolvedPath = realpathSync(requestedPath);
  } catch (error) {
    return { ok: false, error: `could not resolve file: ${error.message}` };
  }
  if (!isInside(root, resolvedPath)) return { ok: false, error: 'file resolves outside the current project' };

  try {
    await trashItem(resolvedPath);
    return { ok: true, relPath: normalized.relPath.split(path.sep).join('/') };
  } catch (error) {
    return { ok: false, error: `could not move file to Trash: ${error.message}` };
  }
}

module.exports = { trashFile, normalizeRelativePath };
