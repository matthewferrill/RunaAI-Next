import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedCompletionMarker} from './retained-completion-marker.mjs';

test('a failed lease can be retained when no completion marker was ever published',()=>{
  assert.equal(retainedCompletionMarker({},'a'.repeat(64),'20260828-campaign-qwen36-r7'),null);
});
