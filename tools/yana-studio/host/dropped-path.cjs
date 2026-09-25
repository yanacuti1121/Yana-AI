"use strict";
const path = require("node:path");

// Turns a dropped or clicked path into an absolute candidate for the
// realpath/containment checks in main.cjs. Kept free of electron so it can be
// unit tested.
//
// A relative path must be resolved against the open project. Falling back to
// process.cwd() is wrong: an app launched from Finder or the Dock has cwd "/",
// so clicking ".claude" with no project open produced
// `ENOENT ... lstat '/.claude'`. With no open project a relative path has
// nothing to resolve against, so say so instead.
function resolveDroppedCandidate(currentRoot, candidate) {
  if (typeof candidate !== "string" || !candidate.trim())
    throw new Error("Invalid dropped path");
  // Terminal's file-link regex keeps an optional :line or :line:col suffix
  // for display; no real file has it in its name.
  const withoutLineSuffix = candidate.replace(/:\d+(?::\d+)?$/, "");
  if (path.isAbsolute(withoutLineSuffix)) return withoutLineSuffix;
  if (!currentRoot)
    throw new Error(
      `Open a project first: "${withoutLineSuffix}" is a relative path and there is no open project to resolve it against.`,
    );
  return path.resolve(currentRoot, withoutLineSuffix);
}

module.exports = { resolveDroppedCandidate };
