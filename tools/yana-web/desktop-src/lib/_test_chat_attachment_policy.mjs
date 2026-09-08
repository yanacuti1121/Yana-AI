import assert from 'node:assert';
import { resolveAttachmentSendPolicy } from './chat-attachment-policy.mjs';

const oneFile = [{ path: 'notes.txt', content: 'review this' }];

assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: null, files: null, image: null }), { allowed: true, hasExplicitAttachments: false });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: null, files: oneFile, image: null }), { allowed: true, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'sovereign', files: oneFile, image: { data: 'x' } }), { allowed: false, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'confidential', files: oneFile, image: null }), { allowed: false, hasExplicitAttachments: true });
assert.deepStrictEqual(resolveAttachmentSendPolicy({ tier: 'confidential', files: null, image: { data: 'x' } }), { allowed: true, hasExplicitAttachments: true });

console.log('chat attachment policy tests passed: 5');
