// Roadmap Phase 5 item 20 — Attachment Manager. Module-level singleton
// (same pattern as terminal-context.mjs), NOT React state, because
// attachments must survive switching the new-app sidebar view away from
// Files and back to Chat — a component-local useState would unmount and
// lose everything the moment the user leaves the Files view.
//
// In-memory only, never written to disk. Content came from a real,
// already-sandboxed read (capability::repo::read_file — Gate L5 path
// escape check, MAX_READ_BYTES size cap, UTF-8-only), so this module
// adds a SECOND bound on top of that (MAX_FILES, MAX_TOTAL_CHARS) — not
// because any single file is unbounded, but because the combined set
// attached to one outgoing chat turn must stay small regardless of how
// many individually-valid files a user selects.
const MAX_FILES = 8;
const MAX_TOTAL_CHARS = 40000;

let attached = []; // [{ path, content, sizeBytes }]
const listeners = new Set();
let externalAttachmentCount = 0;
let attachmentOperationEpoch = 0;

function notify() {
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  return attached;
}

export function isAttached(path) {
  return attached.some((f) => f.path === path);
}

function totalChars() {
  return attached.reduce((sum, f) => sum + f.content.length, 0);
}

// Returns 'attached' | 'detached' | 'file-limit' | 'size-limit' — callers
// (files-view.jsx) surface the limit reasons instead of a silent no-op,
// per the "no fabricated success" rule: a button that visibly does
// nothing when a limit is hit is a worse UI than one that says why.
export function toggleAttachment(path, content, sizeBytes, displayName = path) {
  const idx = attached.findIndex((f) => f.path === path);
  if (idx !== -1) {
    attached = attached.filter((_, i) => i !== idx);
    notify();
    return 'detached';
  }
  if (attached.length >= MAX_FILES) return 'file-limit';
  if (totalChars() + content.length > MAX_TOTAL_CHARS) return 'size-limit';
  attached = [...attached, { path, content, sizeBytes, displayName }];
  notify();
  return 'attached';
}

// External files are selected directly by the user. Store a generated local
// identifier, while the chat receives only a safe filename label — never the
// absolute path from the operating system file picker.
export function attachExternalFile(name, content, sizeBytes) {
  const safeName = String(name || 'untitled')
    .replace(/[\\/\u0000-\u001F\u007F]/g, '_')
    .trim()
    .slice(0, 160) || 'untitled';
  externalAttachmentCount += 1;
  const path = `external:${externalAttachmentCount}`;
  return {
    path,
    result: toggleAttachment(path, content, sizeBytes, `External: ${safeName}`),
  };
}

export function removeAttachment(path) {
  const next = attached.filter((file) => file.path !== path);
  if (next.length === attached.length) return false;
  attached = next;
  notify();
  return true;
}

export function clearAttachments() {
  if (attached.length === 0) return;
  attached = [];
  externalAttachmentCount = 0;
  notify();
}

// Reading a file or preparing an image is asynchronous. A project/tab switch
// must be able to invalidate work already in flight, otherwise an old promise
// can resolve later and add its attachment to the newly selected context.
export function beginAttachmentOperation() {
  return attachmentOperationEpoch;
}

export function isAttachmentOperationCurrent(epoch) {
  return epoch === attachmentOperationEpoch;
}

export function invalidateAttachmentOperations() {
  attachmentOperationEpoch += 1;
}

// Consumed by use-chat-send.js's workspaceContext() envelope — returns
// null (never an empty array) when nothing is attached, matching
// terminal-context.mjs's own "omit entirely, don't send a meaningless
// empty block" convention.
export function getWorkspaceContextFiles() {
  if (attached.length === 0) return null;
  return attached.map((f) => ({ path: f.displayName || f.path, content: f.content }));
}

export const __TEST_ONLY__ = { MAX_FILES, MAX_TOTAL_CHARS };
