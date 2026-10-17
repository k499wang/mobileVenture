import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('factory can generate inside ignored runs without copying secrets, tooling or corrupting binary assets', async () => {
  const foundation = await mkdtemp(path.join(os.tmpdir(), 'venture-generator-'));
  await mkdir(path.join(foundation, 'factory'));
  await copyFile(
    path.join(import.meta.dirname, '../../create-app.mjs'),
    path.join(foundation, 'factory/create-app.mjs'),
  );
  await writeFile(
    path.join(foundation, 'app.json'),
    JSON.stringify({ expo: { name: 'Starter', slug: 'starter', ios: {}, plugins: [] } }),
  );
  await writeFile(
    path.join(foundation, 'package.json'),
    JSON.stringify({
      name: 'starter',
      scripts: {
        ios: 'expo run:ios',
        'agent:studio': 'node factory/agent/cli.mjs',
        'factory:create': 'node factory/create-app.mjs',
      },
    }),
  );
  const binary = Buffer.from([0, 255, 254, 128, 65, 66, 67]);
  await writeFile(path.join(foundation, 'clip.mp4'), binary);
  await writeFile(path.join(foundation, 'README.md'), 'Welcome to __APP_NAME__');
  await writeFile(path.join(foundation, '.env.production'), 'PRIVATE_KEY=do-not-copy');
  await writeFile(path.join(foundation, '.env.example'), 'PUBLIC_PLACEHOLDER=');
  await symlink(path.join(foundation, '.env.production'), path.join(foundation, 'linked-secret.txt'));
  await mkdir(path.join(foundation, '.agent-runs/prior'), { recursive: true });
  await writeFile(path.join(foundation, '.agent-runs/prior/state.json'), 'private run state');
  const target = path.join(foundation, '.agent-runs/current/workspace');
  await promisify(execFile)(process.execPath, [
    path.join(foundation, 'factory/create-app.mjs'),
    target,
    '--yes',
    '--name',
    'Demo',
    '--slug',
    'demo',
    '--bundle-id',
    'com.example.demo',
  ]);
  assert.deepEqual(await readFile(path.join(target, 'clip.mp4')), binary);
  assert.equal(await readFile(path.join(target, 'README.md'), 'utf8'), 'Welcome to Demo');
  for (const file of ['.env.production', 'linked-secret.txt', '.agent-runs', 'factory'])
    await assert.rejects(access(path.join(target, file)));
  await access(path.join(target, '.env.example'));
  const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.scripts, { ios: 'expo run:ios' });
});
