import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RunStore, isRunId } from './store.mjs';

async function tempStore(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'run-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new RunStore(root);
}

test('run IDs are bounded and cannot contain path segments', () => {
  assert.equal(isRunId('run-2026-abc'), true);
  for (const value of ['short', '../escape-run', 'a/b/c/d/e/f', 'x'.repeat(81), 42, null]) assert.equal(isRunId(value), false);
  assert.throws(() => new RunStore('/tmp').directory('../../etc'), /Invalid run ID/);
});

test('save and read round-trip state', async (t) => {
  const store = await tempStore(t);
  const state = { id: 'run-roundtrip', createdAt: '2026-01-01T00:00:00Z', stage: 'research' };
  await store.save(state);
  assert.deepEqual(await store.read(state.id), state);
});

test('list returns newest runs first and skips corrupt or foreign folders', async (t) => {
  const store = await tempStore(t);
  await store.save({ id: 'run-older-one', createdAt: '2026-01-01T00:00:00Z' });
  await store.save({ id: 'run-newer-one', createdAt: '2026-02-01T00:00:00Z' });
  await mkdir(path.join(store.root, 'run-corrupted'), { recursive: true });
  await writeFile(path.join(store.root, 'run-corrupted', 'state.json'), '{');
  await mkdir(path.join(store.root, '.hidden'), { recursive: true });
  assert.deepEqual((await store.list()).map(run => run.id), ['run-newer-one', 'run-older-one']);
});

test('a live lock blocks a second holder until released', async (t) => {
  const store = await tempStore(t);
  const release = await store.lock('run-locked-1');
  await assert.rejects(store.lock('run-locked-1'), /already active/);
  await release();
  const again = await store.lock('run-locked-1');
  await again();
});
