import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 14_000;
const FOUNDATION_TESTS = [
  'src/store/app-store.test.ts',
  'src/services/attribution.test.ts',
  'src/services/purchases.test.ts',
  'src/services/entitlements.test.ts',
  'src/i18n/i18n.test.ts',
  'src/features/onboarding/logic.test.ts',
  'src/features/pet/engine.test.ts',
  'src/features/auth/logic.test.ts',
];
const ACCEPTANCE_TESTS = 'src/features/venture/acceptance.test.ts';
const ROOT_FILES = new Set(['package.json', 'app.json', 'tsconfig.json', 'expo-env.d.ts']);
const SDK_GUIDANCE = 'docs/expo-sdk-57.md';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);
const BLOCKED_SEGMENTS = new Set(['node_modules', '.git', '.codex', '.agents', '.expo', 'ios', 'supabase']);

function tool(name, description, properties = {}, required = []) {
  return { type: 'function', name, description, strict: true,
    parameters: { type: 'object', properties, required, additionalProperties: false } };
}

export const workspaceToolDefinitions = [
  tool('generate_app', 'Generate an independent Expo application in this run workspace; repeated identical requests reuse it.',
    { name: { type: 'string' }, slug: { type: 'string' } }, ['name', 'slug']),
  tool('list_files', 'List readable source files. Before generation this inspects the foundation.'),
  tool('read_file', 'Read a source file, using its relative path. Secrets and dependency directories are inaccessible.',
    { path: { type: 'string' } }, ['path']),
  tool('write_file', 'Write a TypeScript feature source under src/features/venture/ or compose its route in src/app/(tabs)/index.tsx. Test/config/dependency edits are prohibited.',
    { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  tool('run_checks', 'Run strict TypeScript checking, fixed foundation regression tests and the approved planner acceptance tests. Builder-authored tests are never executed, and simulator behavior is not validated.'),
];

function inside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function relativeSource(input) {
  if (typeof input !== 'string' || !input || input.includes('\0') || input.includes('\\') || path.isAbsolute(input)) {
    throw new Error('A relative source path is required.');
  }
  const segments = input.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || BLOCKED_SEGMENTS.has(segment)
    || segment.startsWith('.env') || segment.startsWith('.'))) throw new Error('Forbidden source path.');
  if (input !== SDK_GUIDANCE && !ROOT_FILES.has(input) && (!input.startsWith('src/') || !SOURCE_EXTENSIONS.has(path.extname(input)))) {
    throw new Error('Only app source and approved configuration files can be read.');
  }
  return input;
}

async function noSymlinks(root, relative, { missing = false } = {}) {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    let entry;
    try { entry = await lstat(current); } catch (error) {
      if (missing && error.code === 'ENOENT') return current;
      throw error;
    }
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are inaccessible to agent file tools.');
  }
  return current;
}

/** Deliberately excludes API keys, NODE_OPTIONS, npm credentials, and inherited .env values. */
export function subprocessEnvironment(home, inherited = process.env) {
  const environment = { PATH: inherited.PATH || '/usr/bin:/bin', HOME: home, CI: '1', NO_COLOR: '1', TZ: 'UTC' };
  if (inherited.TMPDIR) environment.TMPDIR = inherited.TMPDIR;
  if (process.platform === 'win32' && inherited.SystemRoot) environment.SystemRoot = inherited.SystemRoot;
  return environment;
}

function safeOutput(output) {
  return String(output).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').slice(-MAX_OUTPUT_BYTES);
}

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}

function command(file, args, options) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(file, args, { ...options, timeout: 120_000, maxBuffer: 2_000_000, encoding: 'utf8', shell: false },
      (error, stdout, stderr) => resolve({
        passed: !error,
        exitCode: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        timedOut: Boolean(error?.killed),
        output: safeOutput(`${stdout ?? ''}${stderr ?? ''}${error && !stdout && !stderr ? error.message : ''}`),
        durationMs: Date.now() - started,
      }));
  });
}

export async function createWorkspaceTools({ runDir, foundationDir, onEvent = async () => {}, injectFailure = false }) {
  const foundation = await realpath(foundationDir);
  // Resolve benign aliases in the supplied foundation (for example macOS /tmp → /private/tmp).
  const requestedRun = path.resolve(foundation, path.relative(path.resolve(foundationDir), path.resolve(runDir)));
  // Runs must live under the dedicated tree, never inside foundation source or arbitrary host paths.
  const runs = path.join(foundation, '.agent-runs');
  if (!inside(runs, requestedRun) || requestedRun === runs) throw new Error('Run directory must be a child of foundation/.agent-runs.');
  await noSymlinks(foundation, path.relative(foundation, requestedRun), { missing: true });
  await mkdir(requestedRun, { recursive: true });
  const run = await realpath(requestedRun);
  if (!inside(runs, run)) throw new Error('Run directory escaped the allowed tree.');
  const workspace = path.join(run, 'workspace');
  const marker = path.join(run, 'workspace.json');
  const generationJournal = path.join(run, 'generation.json');
  const staging = path.join(run, 'generation-staging');
  const injectionMarker = path.join(run, 'failure-injected.json');
  const home = path.join(run, 'process-home');
  await mkdir(home, { recursive: true });
  const env = subprocessEnvironment(home);
  const emit = async (type, data) => onEvent(type, data);
  let acceptanceSource;

  async function hasWorkspace() {
    try {
      const info = await lstat(workspace);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Workspace must be a real directory.');
      return true;
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  async function sourceRoot() { return await hasWorkspace() ? workspace : foundation; }

  async function readSource({ path: input }) {
    const relative = relativeSource(input);
    const root = relative === SDK_GUIDANCE ? foundation : await sourceRoot();
    const target = await noSymlinks(root, relative);
    const info = await lstat(target);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Source file is not a regular file or exceeds the read limit.');
    return { path: relative, content: await readFile(target, 'utf8'), source: root === foundation ? 'foundation' : 'workspace' };
  }

  async function listSources() {
    const root = await sourceRoot();
    const files = [];
    async function walk(relative) {
      if (files.length >= 1200) return;
      let entries;
      try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.') || BLOCKED_SEGMENTS.has(entry.name)) continue;
        const next = `${relative}/${entry.name}`;
        if (entry.isDirectory()) await walk(next);
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(next);
        if (files.length >= 1200) break;
      }
    }
    await noSymlinks(root, 'src');
    await walk('src');
    for (const file of ROOT_FILES) {
      try { await noSymlinks(root, file); files.push(file); } catch { /* optional root file */ }
    }
    return { files, source: root === foundation ? 'foundation' : 'workspace', truncated: files.length >= 1200 };
  }

  async function generate({ name, slug }) {
    if (typeof name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} &.\-]{0,59}$/u.test(name)) throw new Error('App name must be 1–60 plain text characters using letters, digits, spaces, &, periods or hyphens.');
    if (typeof slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50) throw new Error('App slug must be a lowercase slug of up to 50 characters.');
    let journal;
    try {
      await noSymlinks(run, 'generation.json');
      journal = JSON.parse(await readFile(generationJournal, 'utf8'));
      if (journal.name !== name || journal.slug !== slug) throw new Error('This run already generated a different app. Use a new run for a new identity.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (await hasWorkspace()) {
      let prior;
      try {
        await noSymlinks(run, 'workspace.json');
        prior = JSON.parse(await readFile(marker, 'utf8'));
      } catch (error) {
        // A completed staging copy may have been renamed just before the process stopped.
        if (error.code === 'ENOENT' && journal?.status === 'complete') {
          prior = { name, slug, generatedAt: journal.generatedAt };
          await atomicJson(marker, prior);
        } else throw new Error('Unrecognized partial workspace; use a new run directory.');
      }
      if (prior.name !== name || prior.slug !== slug) throw new Error('This run already generated a different app. Use a new run for a new identity.');
      return { workspace, name, slug, reused: true };
    }
    try {
      await noSymlinks(run, 'generation-staging');
      if (!journal) throw new Error('Unrecognized staging directory; use a new run directory.');
      // Only this runtime-owned staging directory is disposable; completed workspaces are preserved.
      await rm(staging, { recursive: true, force: true });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomicJson(generationJournal, { name, slug, status: 'building' });
    const result = await command(process.execPath, [path.join(foundation, 'factory/create-app.mjs'), staging,
      '--yes', '--name', name, '--slug', slug, '--bundle-id', `com.example.${slug.replaceAll('-', '')}`, '--brand-color', '#6C5CE7'],
    { cwd: foundation, env });
    if (!result.passed) throw new Error(`App generation failed: ${result.output}`);
    const generatedAt = new Date().toISOString();
    await atomicJson(generationJournal, { name, slug, status: 'complete', generatedAt });
    await rename(staging, workspace);
    await atomicJson(marker, { name, slug, generatedAt });
    return { workspace, name, slug, reused: false };
  }

  // The approved planner tests are rewritten from the specification, so workspace edits cannot weaken them.
  function setAcceptanceTests(source) {
    if (typeof source !== 'string' || !source || Buffer.byteLength(source) > MAX_FILE_BYTES) throw new Error('Approved acceptance tests are required.');
    acceptanceSource = source;
  }

  async function installAcceptanceTests() {
    if (!acceptanceSource || !await hasWorkspace()) return false;
    await noSymlinks(workspace, ACCEPTANCE_TESTS, { missing: true });
    await mkdir(path.dirname(path.join(workspace, ACCEPTANCE_TESTS)), { recursive: true });
    await noSymlinks(workspace, ACCEPTANCE_TESTS, { missing: true });
    await writeFile(path.join(workspace, ACCEPTANCE_TESTS), acceptanceSource, 'utf8');
    return true;
  }

  async function generateWithTests(args) {
    const result = await generate(args);
    return { ...result, acceptanceTests: await installAcceptanceTests() ? ACCEPTANCE_TESTS : null };
  }

  async function writeSource({ path: input, content }) {
    const relative = relativeSource(input);
    if (!await hasWorkspace()) throw new Error('Generate the app before writing feature files.');
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('Source content must be text of at most 100 KB.');
    const feature = relative.startsWith('src/features/venture/') && /\.(ts|tsx)$/.test(relative);
    if ((!feature && relative !== 'src/app/(tabs)/index.tsx') || /(?:^|\/)(?:jest|babel|metro|eslint|tsconfig)\./.test(relative)
      || /\.(?:test|spec)\./.test(relative) || /(?:^|\/)__tests__(?:\/|$)/.test(relative)
      || relative.endsWith('.d.ts')) throw new Error('Writes are limited to venture feature source and its app route; tests/configuration are prohibited.');
    await noSymlinks(workspace, relative, { missing: true });
    await mkdir(path.dirname(path.join(workspace, relative)), { recursive: true });
    await noSymlinks(workspace, relative, { missing: true });
    let injected = false;
    if (injectFailure && feature) {
      try {
        await writeFile(injectionMarker, JSON.stringify({ path: relative, fixture: 'typescript-assignment-error' }), { flag: 'wx' });
        content += '\n// Demonstration fixture: intentionally injected once by the tool runtime.\nconst agentDemoInjectedFailure: string = 123;\n';
        injected = true;
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    await writeFile(path.join(workspace, relative), content, 'utf8');
    if (injected) await emit('fixture_injected', { path: relative, description: 'Labeled, one-time TypeScript failure fixture for repair demonstration.' });
    return { path: relative, bytes: Buffer.byteLength(content), injectedFailure: injected };
  }

  async function verify() {
    if (!await hasWorkspace()) throw new Error('Generate the app before running checks.');
    const dependencyRoot = path.join(foundation, 'node_modules');
    const tsc = path.join(dependencyRoot, 'typescript/bin/tsc');
    const jest = path.join(dependencyRoot, 'jest/bin/jest.js');
    try { await lstat(tsc); await lstat(jest); }
    catch { throw new Error('Foundation dependencies are missing. Run npm install in the foundation manually.'); }
    const link = path.join(workspace, 'node_modules');
    try {
      const info = await lstat(link);
      if (!info.isSymbolicLink() || await realpath(link) !== await realpath(dependencyRoot)) throw new Error('Untrusted workspace node_modules; refusing checks.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await symlink(dependencyRoot, link, 'dir');
    }
    // These fixed commands never consume model-authored shell strings, npm scripts or Jest configuration.
    const checks = [];
    checks.push({ name: 'generated-source-typecheck', ...await command(process.execPath,
      [tsc, '--noEmit', '--project', path.join(workspace, 'tsconfig.json')], { cwd: workspace, env }) });
    const jestConfig = JSON.stringify({ rootDir: workspace, preset: path.join(dependencyRoot, 'jest-expo'),
      testPathIgnorePatterns: ['/node_modules/', '/ios/'], cacheDirectory: path.join(run, 'jest-cache') });
    // The pet module is optional and may not be present in the foundation.
    const baselineTests = [...FOUNDATION_TESTS];
    const petTest = 'src/features/pet/engine.test.ts';
    try { await lstat(path.join(foundation, petTest)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      baselineTests.splice(baselineTests.indexOf(petTest), 1);
    }
    checks.push({ name: 'foundation-regression-tests', ...await command(process.execPath,
      [jest, '--config', jestConfig, '--runInBand', '--watch=false', '--runTestsByPath', ...baselineTests], { cwd: workspace, env }) });
    if (await installAcceptanceTests()) {
      checks.push({ name: 'acceptance-tests', ...await command(process.execPath,
        [jest, '--config', jestConfig, '--runInBand', '--watch=false', '--runTestsByPath', ACCEPTANCE_TESTS], { cwd: workspace, env }) });
    } else checks.push({ name: 'acceptance-tests', passed: false, exitCode: null, timedOut: false, output: 'No approved acceptance tests were supplied.', durationMs: 0 });
    return { ok: checks.every((check) => check.passed), checks,
      scope: 'Strict generated-source typecheck, fixed foundation regression tests and approved planner acceptance tests. Criteria marked for manual review and native behavior require simulator/device review.' };
  }

  const handlers = { generate_app: generateWithTests, list_files: listSources, read_file: readSource, write_file: writeSource, run_checks: verify };
  async function execute(name, args = {}) {
    if (!Object.hasOwn(handlers, name)) throw new Error(`Unknown workspace tool: ${name}`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
    const definition = workspaceToolDefinitions.find((entry) => entry.name === name);
    const allowed = Object.keys(definition.parameters.properties);
    if (Object.keys(args).some((key) => !allowed.includes(key)) || definition.parameters.required.some((key) => !Object.hasOwn(args, key))) {
      throw new Error(`Invalid arguments for ${name}.`);
    }
    return handlers[name](args);
  }
  return { definitions: workspaceToolDefinitions, execute, workspace, listFiles: listSources,
    readFile: (input) => readSource(typeof input === 'string' ? { path: input } : input), verify, setAcceptanceTests };
}
