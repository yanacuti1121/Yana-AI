import assert from 'node:assert';
import {
  attachExternalFile, toggleAttachment, isAttached, clearAttachments, getWorkspaceContextFiles,
  beginAttachmentOperation, isAttachmentOperationCurrent, invalidateAttachmentOperations, __TEST_ONLY__,
} from './file-attachments.mjs';
import { resolveAttachmentSendPolicy } from './chat-attachment-policy.mjs';

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
const external = attachExternalFile('/Users/tam/notes.txt', 'private note', 12);
assert.strictEqual(external.result, 'attached');
assert.strictEqual(isAttached(external.path), true);
assert.deepStrictEqual(getWorkspaceContextFiles(), [{ path: 'External: _Users_tam_notes.txt', content: 'private note' }]);
clearAttachments();
assert.strictEqual(getWorkspaceContextFiles(), null);

// File/image preparation is asynchronous. A tab or project switch invalidates
// the old operation so its late completion cannot attach stale context.
const oldOperation = beginAttachmentOperation();
assert.strictEqual(isAttachmentOperationCurrent(oldOperation), true);
invalidateAttachmentOperations();
assert.strictEqual(isAttachmentOperationCurrent(oldOperation), false);
assert.strictEqual(isAttachmentOperationCurrent(beginAttachmentOperation()), true);

const policyFile = [{ path: 'External: notes.txt', content: 'private note' }];
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: null, files: policyFile, image: null }), { allowed: true, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'sovereign', files: policyFile, image: { data: 'x' } }), { allowed: false, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'confidential', files: policyFile, image: null }), { allowed: false, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'confidential', files: null, image: { data: 'x' } }), { allowed: true, hasExplicitAttachments: true });

console.log('file attachment context tests passed');
