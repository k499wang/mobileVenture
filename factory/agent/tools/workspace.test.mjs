import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorkspaceTools, subprocessEnvironment } from './workspace.mjs';

async function fixture(t, options = {}) {
  const foundationDir = await mkdtemp(path.join(os.tmpdir(), 'venture-tools-'));
  t.after(() => rm(foundationDir, { recursive: true, force: true }));
  await mkdir(path.join(foundationDir, 'src/features/common'), { recursive: true });
  await mkdir(path.join(foundationDir, 'factory'), { recursive: true });
  await writeFile(path.join(foundationDir, 'src/features/common/example.ts'), 'export const baseline = true;\n');
  await writeFile(path.join(foundationDir, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(path.join(foundationDir, '.env'), 'PRIVATE=must-not-be-readable');
  await writeFile(path.join(foundationDir, 'factory/create-app.mjs'), `
    import {mkdir, writeFile} from 'node:fs/promises';
    import path from 'node:path';
    const target = process.argv[2];
    await mkdir(path.join(target, 'src/features/common'), {recursive:true});
    await writeFile(path.join(target,'src/features/common/example.ts'),'export const generated = true;');
    await writeFile(path.join(target,'process-environment.json'),JSON.stringify(process.env));
  `);
  const runDir = path.join(foundationDir, '.agent-runs', 'run');
  const tools = await createWorkspaceTools({ runDir, foundationDir, ...options });
  return { foundationDir, runDir, tools, workspace: tools.workspace };
}

test('file tools reject traversal, absolute paths, hidden secrets, dependencies and unknown commands', async (t) => {
  const { tools } = await fixture(t);
  for (const source of ['../.env', '/etc/passwd', 'src/../../.env', 'src/.env.production', '.env',
    'src/node_modules/key.ts', 'src\\features\\common\\example.ts', 'src//features/common/example.ts']) {
    await assert.rejects(tools.execute('read_file', { path: source }));
  }
  await assert.rejects(tools.execute('exec_shell', { command: 'echo bad' }), /Unknown workspace tool/);
  await assert.rejects(tools.execute('read_file', { path: 'package.json', surprise: true }), /Invalid arguments/);
  await assert.rejects(tools.execute('read_file', {}), /Invalid arguments/);
  assert.equal((await tools.readFile('src/features/common/example.ts')).source, 'foundation');
});

test('reads and listings cannot follow symlinks', async (t) => {
  const { foundationDir, tools } = await fixture(t);
  await symlink(path.join(foundationDir, '.env'), path.join(foundationDir, 'src/features/common/leak.ts'));
  await symlink(path.join(foundationDir, 'factory'), path.join(foundationDir, 'src/linked'));
  await assert.rejects(tools.readFile('src/features/common/leak.ts'), /Symbolic links/);
  assert.deepEqual((await tools.listFiles()).files, ['src/features/common/example.ts', 'package.json']);
});

test('generated source reads switch to workspace; writes remain scoped to feature and route', async (t) => {
  const { tools, workspace } = await fixture(t);
  await assert.rejects(tools.execute('write_file', { path: 'src/features/venture/model.ts', content: '' }), /Generate/);
  await tools.execute('generate_app', { name: 'Shift Habits', slug: 'shift-habits' });
  assert.equal((await tools.readFile('src/features/common/example.ts')).source, 'workspace');
  for (const file of ['package.json', 'src/services/purchases.ts', 'src/features/venture/model.test.ts',
    'src/features/venture/model.spec.tsx', 'src/features/venture/__tests__/model.ts',
    'src/features/venture/tsconfig.ts', 'src/features/venture/global.d.ts', 'src/features/venture/code.js']) {
    await assert.rejects(tools.execute('write_file', { path: file, content: 'bad' }));
  }
  await tools.execute('write_file', { path: 'src/features/venture/model.ts', content: 'export const value = 1;\n' });
  await tools.execute('write_file', { path: 'src/app/(tabs)/index.tsx', content: 'export { default } from "../../features/venture";\n' });
  assert.equal(await readFile(path.join(workspace, 'src/features/venture/model.ts'), 'utf8'), 'export const value = 1;\n');
  await symlink(path.join(workspace, 'src/features/common'), path.join(workspace, 'src/features/venture/escape'));
  await assert.rejects(tools.execute('write_file', { path: 'src/features/venture/escape/other.ts', content: 'bad' }), /Symbolic links/);
});

test('generation replays identical identity and refuses conflicting identity', async (t) => {
  const { tools, foundationDir, runDir } = await fixture(t);
  const input = { name: 'Shift Habits', slug: 'shift-habits' };
  assert.equal((await tools.execute('generate_app', input)).reused, false);
  const resumed = await createWorkspaceTools({ foundationDir, runDir });
  assert.equal((await resumed.execute('generate_app', input)).reused, true);
  await assert.rejects(resumed.execute('generate_app', { name: 'Other App', slug: 'other-app' }), /different app/);
  await assert.rejects(resumed.execute('generate_app', { name: '$(whoami)', slug: 'safe' }), /plain text/);
  await assert.rejects(resumed.execute('generate_app', { name: 'Safe', slug: '../unsafe' }), /slug/);
});

test('interrupted generation discards only owned staging and resumes; completed rename recovers marker', async (t) => {
  const { tools, foundationDir, runDir, workspace } = await fixture(t);
  await writeFile(path.join(foundationDir, 'factory/create-app.mjs'), `
    import {mkdir, writeFile} from 'node:fs/promises';
    import path from 'node:path';
    const target = process.argv[2];
    await mkdir(path.join(target,'src'),{recursive:true});
    try {
      await writeFile(path.join(path.dirname(target),'first-attempt'),'yes',{flag:'wx'});
      await writeFile(path.join(target,'partial.txt'),'must-be-removed');
      process.exit(7);
    } catch (error) { if(error.code !== 'EEXIST') throw error; }
    await writeFile(path.join(target,'src/completed.ts'),'export const done = true;');
  `);
  const input = { name: 'Resume Demo', slug: 'resume-demo' };
  await assert.rejects(tools.execute('generate_app', input), /App generation failed/);
  assert.equal((await tools.execute('generate_app', input)).reused, false);
  await assert.rejects(readFile(path.join(workspace, 'partial.txt')), { code: 'ENOENT' });
  await rm(path.join(runDir, 'workspace.json'));
  assert.equal((await tools.execute('generate_app', input)).reused, true);
  assert.equal(JSON.parse(await readFile(path.join(runDir, 'workspace.json'), 'utf8')).slug, input.slug);
});

test('subprocesses receive a minimal environment with no API keys or executable preload hooks', async (t) => {
  const env = subprocessEnvironment('/tmp/isolated', {
    PATH: '/usr/bin', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--require /evil.js',
    NPM_TOKEN: 'secret', HOME: '/private/home', TMPDIR: '/tmp',
  });
  assert.deepEqual(env, { PATH: '/usr/bin', HOME: '/tmp/isolated', CI: '1', NO_COLOR: '1', TZ: 'UTC', TMPDIR: '/tmp' });
  const { tools, workspace } = await fixture(t);
  await tools.execute('generate_app', { name: 'Safe', slug: 'safe' });
  const actual = JSON.parse(await readFile(path.join(workspace, 'process-environment.json'), 'utf8'));
  assert.equal(actual.OPENAI_API_KEY, undefined);
  assert.equal(actual.NODE_OPTIONS, undefined);
});

test('failure injection is labeled, persisted, and repairs by overwriting source', async (t) => {
  const events = [];
  const { tools, foundationDir, runDir } = await fixture(t, { injectFailure: true, onEvent: (type, data) => events.push({ type, ...data }) });
  await tools.execute('generate_app', { name: 'Demo', slug: 'demo' });
  const source = { path: 'src/features/venture/model.ts', content: 'export const value = 1;' };
  const first = await tools.execute('write_file', source);
  assert.equal(first.injectedFailure, true);
  assert.match((await tools.readFile(source.path)).content, /agentDemoInjectedFailure: string = 123/);
  assert.equal(events[0].type, 'fixture_injected');
  const resumed = await createWorkspaceTools({ foundationDir, runDir, injectFailure: true });
  assert.equal((await resumed.execute('write_file', source)).injectedFailure, false);
  assert.equal((await resumed.readFile(source.path)).content, source.content);
});

test('run directory and workspace cannot redirect tools through symlinks', async (t) => {
  const { foundationDir, runDir, tools } = await fixture(t);
  await assert.rejects(createWorkspaceTools({ foundationDir, runDir: path.join(foundationDir, 'src/run') }), /Run directory/);
  await symlink(path.join(foundationDir, 'src'), path.join(runDir, 'workspace'));
  await assert.rejects(tools.listFiles(), /real directory/);
  const redirected = path.join(foundationDir, '.agent-runs', 'redirected');
  await symlink(path.join(foundationDir, 'src'), redirected);
  await assert.rejects(createWorkspaceTools({ foundationDir, runDir: redirected }), /Symbolic links/);
});

test('verification requires generation and existing local dependencies', async (t) => {
  const { tools } = await fixture(t);
  await assert.rejects(tools.verify(), /Generate/);
  await tools.execute('generate_app', { name: 'Demo', slug: 'demo' });
  await assert.rejects(tools.verify(), /dependencies are missing/);
});

test('verification invokes fixed checks with bounded output and rejects untrusted dependency links', async (t) => {
  const { tools, foundationDir, workspace } = await fixture(t);
  const petTest = path.join(foundationDir, 'src/features/pet/engine.test.ts');
  await mkdir(path.dirname(petTest), { recursive: true });
  await writeFile(petTest, '// optional pet regression fixture');
  await tools.execute('generate_app', { name: 'Checks Demo', slug: 'checks-demo' });
  for (const executable of ['typescript/bin/tsc', 'jest/bin/jest.js']) {
    const target = path.join(foundationDir, 'node_modules', executable);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'console.log(JSON.stringify({args:process.argv.slice(2),key:process.env.OPENAI_API_KEY}));');
  }
  const missing = await tools.verify();
  assert.equal(missing.ok, false, 'checks fail until approved acceptance tests are supplied');
  assert.equal(missing.checks[2].name, 'acceptance-tests');
  tools.setAcceptanceTests("it('works', () => {});\n");
  const result = await tools.verify();
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 3);
  const typecheck = JSON.parse(result.checks[0].output);
  assert.deepEqual(typecheck.args, ['--noEmit', '--project', path.join(workspace, 'tsconfig.json')]);
  const jest = JSON.parse(result.checks[1].output);
  assert.ok(jest.args.includes('--runTestsByPath'));
  assert.ok(jest.args.includes('src/features/pet/engine.test.ts'));
  assert.ok(!jest.args.some((arg) => arg.includes('src/features/venture/')));
  assert.equal(jest.key, undefined);
  assert.deepEqual(JSON.parse(result.checks[2].output).args.slice(-2), ['--runTestsByPath', 'src/features/venture/acceptance.test.ts']);
  await rm(petTest);
  const withoutPet = await tools.verify();
  assert.ok(!JSON.parse(withoutPet.checks[1].output).args.includes('src/features/pet/engine.test.ts'));
  await rm(path.join(workspace, 'node_modules'));
  await symlink(path.join(foundationDir, 'src'), path.join(workspace, 'node_modules'));
  await assert.rejects(tools.verify(), /Untrusted workspace/);
});

test('approved acceptance tests are installed at generation, unwritable by the builder, and restored before checks', async (t) => {
  const { tools, foundationDir, workspace } = await fixture(t);
  const approved = "it('adds an action', () => {});\n";
  tools.setAcceptanceTests(approved);
  const generated = await tools.execute('generate_app', { name: 'Tests Demo', slug: 'tests-demo' });
  assert.equal(generated.acceptanceTests, 'src/features/venture/acceptance.test.ts');
  const testFile = path.join(workspace, generated.acceptanceTests);
  assert.equal(await readFile(testFile, 'utf8'), approved);
  assert.equal((await tools.execute('read_file', { path: generated.acceptanceTests })).content, approved);
  await assert.rejects(tools.execute('write_file', { path: generated.acceptanceTests, content: "it('adds an action', () => {});" }), /tests\/configuration are prohibited/);
  await writeFile(testFile, '// weakened outside the tools');
  for (const executable of ['typescript/bin/tsc', 'jest/bin/jest.js']) {
    const target = path.join(foundationDir, 'node_modules', executable);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'console.log("{}");');
  }
  await tools.verify();
  assert.equal(await readFile(testFile, 'utf8'), approved);
  assert.throws(() => tools.setAcceptanceTests(''), /required/);
});
