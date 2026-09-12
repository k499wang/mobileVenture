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
