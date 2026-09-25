"use strict";
// Regression tests for resolveDroppedCandidate: the path arithmetic behind
// studio:openDroppedPath, which is also used for clickable file links in the
// Terminal. A relative path with no open project used to be resolved against
// the process cwd; an app launched from Finder has cwd "/", so a click on
// ".claude" failed with `ENOENT ... lstat '/.claude'`.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveDroppedCandidate } = require("../host/dropped-path.cjs");

const ROOT = path.resolve("/tmp/yana-project");

test("an absolute path is returned unchanged", () => {
  const absolute = path.resolve("/tmp/other/file.ts");
  assert.equal(resolveDroppedCandidate(ROOT, absolute), absolute);
  assert.equal(resolveDroppedCandidate(null, absolute), absolute);
});

test("a trailing :line or :line:col suffix is stripped", () => {
  const absolute = path.resolve("/tmp/other/file.ts");
  assert.equal(resolveDroppedCandidate(ROOT, `${absolute}:12`), absolute);
  assert.equal(resolveDroppedCandidate(ROOT, `${absolute}:12:3`), absolute);
});

test("a relative path resolves against the open project, not the cwd", () => {
  assert.equal(
    resolveDroppedCandidate(ROOT, ".claude"),
    path.join(ROOT, ".claude"),
  );
  assert.equal(
    resolveDroppedCandidate(ROOT, "src/app.ts:40"),
    path.join(ROOT, "src", "app.ts"),
  );
});

test("a relative path with no open project fails clearly instead of hitting /", () => {
  for (const noRoot of [null, undefined, ""]) {
    assert.throws(
      () => resolveDroppedCandidate(noRoot, ".claude"),
      (error) => {
        assert.match(error.message, /Open a project first/);
        assert.doesNotMatch(error.message, /ENOENT/);
        return true;
      },
    );
  }
});

test("empty, blank and non-string input is rejected", () => {
  for (const bad of ["", "   ", null, undefined, 42, {}]) {
    assert.throws(
      () => resolveDroppedCandidate(ROOT, bad),
      /Invalid dropped path/,
    );
  }
});

test("very long and odd input does not crash the resolver", () => {
  const long = "a".repeat(65536);
  assert.equal(
    resolveDroppedCandidate(ROOT, long),
    path.join(ROOT, long),
  );
  assert.doesNotThrow(() => resolveDroppedCandidate(ROOT, "../up/../x\u0000y"));
});
