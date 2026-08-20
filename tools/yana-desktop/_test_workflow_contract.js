'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'desktop.yml'), 'utf8');
assert.match(workflow, /^permissions:\n  contents: read$/m);
assert.strictEqual((workflow.match(/tools\/yana-desktop\/dist\/\*\.deb/g) || []).length, 2);
assert.strictEqual((workflow.match(/tools\/yana-desktop\/dist\/latest-mac\.yml/g) || []).length, 2);
assert.strictEqual((workflow.match(/tools\/yana-desktop\/dist\/\*\.dmg\.blockmap/g) || []).length, 2);
assert.match(workflow, /node-version: '24'/);
assert.match(workflow, /run: npm test/);
assert.match(workflow, /^  publish:\n[\s\S]*?    needs: build/m);
assert.match(workflow, /assemble-release\.js/);
assert.match(workflow, /contents: write/);
assert.match(workflow, /softprops\/action-gh-release@[0-9a-f]{40} # v3\.0\.2 \(node24\)/);

console.log('Desktop workflow contract tests passed: 10');
