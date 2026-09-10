const fs = require("node:fs");
const path = require("node:path");

// Best-effort heuristic, not a real CSS/design-token parser: regex-scan the
// project's own CSS for custom properties that look like an accent/surface/
// foreground color, so Design Canvas can start from the project's real
// palette instead of an arbitrary default. First match per category wins —
// good enough to seed a starting point the user can still override by hand,
// not a claim of being authoritative about the project's design system.
// Each keyword must be its own hyphen-delimited segment of the custom
// property name (--accent, --brand-accent, --accent-color — never a bare
// substring match like "bg" inside "tabgroup" or "text" inside "context").
function tokenPattern(...keywords) {
  const words = keywords.join("|");
  return new RegExp(
    `--(?:[\\w]+-)*(?:${words})(?:-[\\w-]*)?\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`,
    "i",
  );
}
const TOKEN_PATTERNS = {
  accent: tokenPattern("accent", "primary", "brand"),
  surface: tokenPattern("surface", "background", "bg"),
  foreground: tokenPattern("foreground", "text", "fg"),
};
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "release",
  "target",
  ".git",
]);
const MAX_FILES = 300;
const MAX_BYTES_PER_FILE = 256 * 1024;
const MAX_DEPTH = 6;

function normalizeHex(value) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function collectCssFiles(root, depth, files) {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectCssFiles(full, depth + 1, files);
    } else if (/\.(css|scss)$/i.test(entry.name)) {
      files.push(full);
    }
  }
}

// `root` is assumed already validated by the caller (projects.resolve(root)
// in main.cjs), same convention as diff-comments.cjs/project-memory.cjs.
function scanProjectTokens(root) {
  const files = [];
  collectCssFiles(root, 0, files);
  const found = {};
  const categories = Object.keys(TOKEN_PATTERNS);
  for (const file of files) {
    let text;
    try {
      if (fs.statSync(file).size > MAX_BYTES_PER_FILE) continue;
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const category of categories) {
      if (found[category]) continue;
      const match = text.match(TOKEN_PATTERNS[category]);
      const hex = match && normalizeHex(match[1]);
      if (hex)
        found[category] = { value: hex, file: path.relative(root, file) };
    }
    if (Object.keys(found).length === categories.length) break;
  }
  return found;
}

module.exports = { scanProjectTokens };
