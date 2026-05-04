import assert from 'node:assert/strict';
import test from 'node:test';
import { ANTHROPIC_URL, MINIMAX_URL } from '../src/constants.js';
import { isPatched, patchContent } from '../src/patching.js';

test('patchContent replaces Anthropic URL and bare hostname', () => {
  const input = `${ANTHROPIC_URL} and "api.anthropic.com"`;
  const result = patchContent(input);

  assert.equal(result.content.includes(ANTHROPIC_URL), false);
  assert.equal(result.content.includes(MINIMAX_URL), true);
  assert.equal(result.content.includes('"api.minimax.io/anthropic"'), true);
  assert.equal(result.changes.length, 2);
});

test('isPatched accepts URL-only patches for modern bundled builds', () => {
  assert.equal(isPatched(`${MINIMAX_URL} only`), true);
  assert.equal(isPatched(`${MINIMAX_URL} ${ANTHROPIC_URL}`), false);
});
