import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioServer } from './server.mjs';

test('local console rejects foreign origins and returns no credentials in config', async (t) => {
  const studio = { liveAvailable: true, model: 'test-model', apiKey: 'secret-must-not-leak' };
  const server = createStudioServer(studio);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await fetch(`${base}/api/config`);
  assert.equal(config.status, 200);
  assert(!(await config.text()).includes(studio.apiKey));
  const denied = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  const index = await fetch(base);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
