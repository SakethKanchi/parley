import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../web/src/api.js';

test('login preserves the server error for invalid credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'Invalid username or password.' }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  );
  try {
    await assert.rejects(api.login('admin', 'wrong'), (error) => {
      assert.equal(error.message, 'Invalid username or password.');
      assert.equal(error.status, 401);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
