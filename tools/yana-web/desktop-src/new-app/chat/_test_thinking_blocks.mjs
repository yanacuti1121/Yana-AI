import assert from 'node:assert/strict';
import { splitThinkingBlocks } from './thinking-blocks.mjs';

assert.deepEqual(splitThinkingBlocks('Hello'), { display: 'Hello', reasoning: null });
assert.deepEqual(splitThinkingBlocks('<think>plan</think>Answer'), { display: 'Answer', reasoning: 'plan' });
assert.deepEqual(splitThinkingBlocks('<think>first</think>Answer<think>second</think>'), { display: 'Answer', reasoning: 'first\n\n---\n\nsecond' });
assert.deepEqual(splitThinkingBlocks('<think>still thinking'), { display: '', reasoning: 'still thinking' });
assert.deepEqual(splitThinkingBlocks(null), { display: '', reasoning: null });

console.log('thinking-block tests passed: 5');
