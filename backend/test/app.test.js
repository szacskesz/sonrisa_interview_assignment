import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

test('the API responds with its health status', async (t) => {
  const app = createApp();
  t.after(() => app.close());
  const response = await app.inject('/api/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
});
