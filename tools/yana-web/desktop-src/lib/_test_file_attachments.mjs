import assert from 'node:assert';
import {
  toggleAttachment, isAttached, clearAttachments, getWorkspaceContextFiles, __TEST_ONLY__,
} from './file-attachments.mjs';

// Nothing attached yet -> context omits the field entirely.
assert.strictEqual(getWorkspaceContextFiles(), null);

// Attach a file.
assert.strictEqual(toggleAttachment('src/main.rs', 'fn main() {}', 12), 'attached');
assert.strictEqual(isAttached('src/main.rs'), true);
assert.deepStrictEqual(getWorkspaceContextFiles(), [{ path: 'src/main.rs', content: 'fn main() {}' }]);

// Toggling the same path again detaches it.
assert.strictEqual(toggleAttachment('src/main.rs', 'fn main() {}', 12), 'detached');
assert.strictEqual(isAttached('src/main.rs'), false);
assert.strictEqual(getWorkspaceContextFiles(), null);

// File-count limit.
clearAttachments();
for (let i = 0; i < __TEST_ONLY__.MAX_FILES; i++) {
  assert.strictEqual(toggleAttachment(`f${i}.txt`, 'x', 1), 'attached');
}
assert.strictEqual(toggleAttachment('one-too-many.txt', 'x', 1), 'file-limit');
assert.strictEqual(isAttached('one-too-many.txt'), false);

// Size limit — a single file larger than the total cap is rejected, not truncated.
clearAttachments();
const huge = 'x'.repeat(__TEST_ONLY__.MAX_TOTAL_CHARS + 1);
assert.strictEqual(toggleAttachment('huge.txt', huge, huge.length), 'size-limit');
assert.strictEqual(isAttached('huge.txt'), false);

clearAttachments();
assert.strictEqual(getWorkspaceContextFiles(), null);

console.log('file-attachments tests passed: 10');
