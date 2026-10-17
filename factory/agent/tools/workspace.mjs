/**
 * Everything an agent can touch on disk: the five workspace tools and their safety rules.
 *
 *   generate_app  create the app from the foundation (crash-safe, see `generate`)
 *   list_files    list app source files
 *   read_file     read one source file
 *   write_file    write feature code, only under src/features/venture/ and the tab route
 *   run_checks    typecheck + foundation regression tests + the planner's acceptance tests
 *
 * Each run gets its own folder under .agent-runs/<id>/. Agents pass relative paths only;
 * every path is checked for traversal, hidden files, secrets and symlinks before use, and
 * checks run fixed commands with a scrubbed environment (no API keys reach subprocesses).
 *
 * Walkthrough order: `generate` (the crash-recovery journal), then `writeSource` (what the
 * builder may write), then `verify` (the real checks, including acceptance tests).
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 14_000;
// Existing foundation tests that every generated app must still pass (regression check).
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
// Where the planner's approved tests are installed. The builder can read this file, not write it.
const ACCEPTANCE_TESTS = 'src/features/venture/acceptance.test.ts';
const ROOT_FILES = new Set(['package.json', 'app.json', 'tsconfig.json', 'expo-env.d.ts']);
const SDK_GUIDANCE = 'docs/expo-sdk-57.md';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);
const BLOCKED_SEGMENTS = new Set(['node_modules', '.git', '.codex', '.agents', '.expo', 'ios', 'supabase']);

function tool(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    name,
    description,
    strict: true,
    parameters: { type: 'object', properties, required, additionalProperties: false },
  };
}

// Tool definitions exactly as the model sees them (OpenAI function-calling format).
export const workspaceToolDefinitions = [
  tool(
    'generate_app',
    'Generate an independent Expo application in this run workspace; repeated identical requests reuse it.',
    { name: { type: 'string' }, slug: { type: 'string' } },
    ['name', 'slug'],
  ),
  tool('list_files', 'List readable source files. Before generation this inspects the foundation.'),
  tool(
    'read_file',
    'Read a source file, using its relative path. Secrets and dependency directories are inaccessible.',
    { path: { type: 'string' } },
    ['path'],
  ),
  tool(
    'write_file',
    'Write a TypeScript feature source under src/features/venture/ or compose its route in src/app/(tabs)/index.tsx. Test/config/dependency edits are prohibited.',
    { path: { type: 'string' }, content: { type: 'string' } },
    ['path', 'content'],
  ),
  tool(
    'run_checks',
    'Run strict TypeScript checking, fixed foundation regression tests and the approved planner acceptance tests. Builder-authored tests are never executed, and simulator behavior is not validated.',
  ),
];

function inside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

// Turn an agent-supplied path into a safe relative path, or throw. Blocks absolute paths,
// `..`, hidden files, .env files and dependency folders; allows app source and a few configs.
function relativeSource(input) {
  if (
    typeof input !== 'string' ||
    !input ||
    input.includes('\0') ||
    input.includes('\\') ||
    path.isAbsolute(input)
  ) {
    throw new Error('A relative source path is required.');
  }
  const segments = input.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        BLOCKED_SEGMENTS.has(segment) ||
        segment.startsWith('.env') ||
        segment.startsWith('.'),
    )
  )
    throw new Error('Forbidden source path.');
  if (
    input !== SDK_GUIDANCE &&
    !ROOT_FILES.has(input) &&
    (!input.startsWith('src/') || !SOURCE_EXTENSIONS.has(path.extname(input)))
  ) {
    throw new Error('Only app source and approved configuration files can be read.');
  }
  return input;
}

// Walk a path one segment at a time and refuse any symlink, so a link can't point a tool
// outside the workspace (for example at ~/.ssh).
async function noSymlinks(root, relative, { missing = false } = {}) {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if (missing && error.code === 'ENOENT') return current;
      throw error;
    }
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are inaccessible to agent file tools.');
  }
  return current;
}

/** Deliberately excludes API keys, NODE_OPTIONS, npm credentials, and inherited .env values. */
export function subprocessEnvironment(home, inherited = process.env) {
  const environment = {
    PATH: inherited.PATH || '/usr/bin:/bin',
    HOME: home,
    CI: '1',
    NO_COLOR: '1',
    TZ: 'UTC',
  };
  if (inherited.TMPDIR) environment.TMPDIR = inherited.TMPDIR;
  if (process.platform === 'win32' && inherited.SystemRoot) environment.SystemRoot = inherited.SystemRoot;
  return environment;
}

// Strip terminal colors and keep only the tail of command output, which is what the model sees.
function safeOutput(output) {
  return String(output)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .slice(-MAX_OUTPUT_BYTES);
}

// Write JSON to a temp file, then rename it into place. A rename is atomic, so a crash leaves
// either the old file or the new one, never a half-written file.
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}

// Run a fixed executable with fixed arguments (no shell) and report pass/fail plus output.
function command(file, args, options) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { ...options, timeout: 120_000, maxBuffer: 2_000_000, encoding: 'utf8', shell: false },
      (error, stdout, stderr) =>
        resolve({
          passed: !error,
          exitCode: error ? (typeof error.code === 'number' ? error.code : null) : 0,
          timedOut: Boolean(error?.killed),
          output: safeOutput(
            `${stdout ?? ''}${stderr ?? ''}${error && !stdout && !stderr ? error.message : ''}`,
          ),
          durationMs: Date.now() - started,
        }),
    );
  });
}

/** Create the tool set for one run. All paths below are inside that run's folder. */
export async function createWorkspaceTools({
  runDir,
  foundationDir,
  onEvent = async () => {},
  injectFailure = false,
}) {
  const foundation = await realpath(foundationDir);
  // Resolve benign aliases in the supplied foundation (for example macOS /tmp → /private/tmp).
  const requestedRun = path.resolve(
    foundation,
    path.relative(path.resolve(foundationDir), path.resolve(runDir)),
  );
  // Runs must live under the dedicated tree, never inside foundation source or arbitrary host paths.
  const runs = path.join(foundation, '.agent-runs');
  if (!inside(runs, requestedRun) || requestedRun === runs)
    throw new Error('Run directory must be a child of foundation/.agent-runs.');
  await noSymlinks(foundation, path.relative(foundation, requestedRun), { missing: true });
  await mkdir(requestedRun, { recursive: true });
  const run = await realpath(requestedRun);
  if (!inside(runs, run)) throw new Error('Run directory escaped the allowed tree.');
  const workspace = path.join(run, 'workspace'); // the finished app
  const marker = path.join(run, 'workspace.json'); // which app identity the workspace holds
  const generationJournal = path.join(run, 'generation.json'); // write-ahead journal: building | complete
  const staging = path.join(run, 'generation-staging'); // where the app is built before it's moved in
  const injectionMarker = path.join(run, 'failure-injected.json');
  const home = path.join(run, 'process-home');
  await mkdir(home, { recursive: true });
  const env = subprocessEnvironment(home);
  const emit = async (type, data) => onEvent(type, data);
  let acceptanceSource; // the approved planner test file, set by the orchestrator after approval

  async function hasWorkspace() {
    try {
      const info = await lstat(workspace);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error('Workspace must be a real directory.');
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async function sourceRoot() {
    return (await hasWorkspace()) ? workspace : foundation;
  }

  async function readSource({ path: input }) {
    const relative = relativeSource(input);
    const root = relative === SDK_GUIDANCE ? foundation : await sourceRoot();
    const target = await noSymlinks(root, relative);
    const info = await lstat(target);
    if (!info.isFile() || info.size > MAX_FILE_BYTES)
      throw new Error('Source file is not a regular file or exceeds the read limit.');
    return {
      path: relative,
      content: await readFile(target, 'utf8'),
      source: root === foundation ? 'foundation' : 'workspace',
    };
  }

  async function listSources() {
    const root = await sourceRoot();
    const files = [];
    async function walk(relative) {
      if (files.length >= 1200) return;
      let entries;
      try {
        entries = await readdir(path.join(root, relative), { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.') || BLOCKED_SEGMENTS.has(entry.name))
          continue;
        const next = `${relative}/${entry.name}`;
        if (entry.isDirectory()) await walk(next);
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(next);
        if (files.length >= 1200) break;
      }
    }
    await noSymlinks(root, 'src');
    await walk('src');
    for (const file of ROOT_FILES) {
      try {
        await noSymlinks(root, file);
        files.push(file);
      } catch {
        /* optional root file */
      }
    }
    return {
      files,
      source: root === foundation ? 'foundation' : 'workspace',
      truncated: files.length >= 1200,
    };
  }

  /**
   * Create the app, safely repeatable after a crash at any point.
   *
   * Order of operations:
   *   1. journal = "building"   (written before anything else)
   *   2. build the app into generation-staging/
   *   3. journal = "complete"
   *   4. rename generation-staging/ → workspace/   (atomic)
   *   5. write workspace.json
   *
   * On a retry, the journal and the folders on disk say exactly where the last attempt stopped:
   *   - workspace exists with matching identity      → reuse it, don't build a second app
   *   - crashed between 4 and 5                      → journal says complete, so finish step 5
   *   - crashed during 2                             → staging is half-built: delete it and rebuild
   *   - asked for a different name/slug than before  → refuse; one run = one app
   */
  async function generate({ name, slug }) {
    if (typeof name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} &.\-]{0,59}$/u.test(name))
      throw new Error(
        'App name must be 1–60 plain text characters using letters, digits, spaces, &, periods or hyphens.',
      );
    if (typeof slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 50)
      throw new Error('App slug must be a lowercase slug of up to 50 characters.');

    // Read the journal from any previous attempt. A different identity is refused outright.
    let journal;
    try {
      await noSymlinks(run, 'generation.json');
      journal = JSON.parse(await readFile(generationJournal, 'utf8'));
      if (journal.name !== name || journal.slug !== slug)
        throw new Error('This run already generated a different app. Use a new run for a new identity.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // The app already exists: reuse it (after confirming it is the same app).
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
      if (prior.name !== name || prior.slug !== slug)
        throw new Error('This run already generated a different app. Use a new run for a new identity.');
      return { workspace, name, slug, reused: true };
    }

    // A leftover staging folder means a previous attempt crashed mid-build. Delete only that
    // folder (the runtime owns it); never delete a completed workspace.
    try {
      await noSymlinks(run, 'generation-staging');
      if (!journal) throw new Error('Unrecognized staging directory; use a new run directory.');
      // Only this runtime-owned staging directory is disposable; completed workspaces are preserved.
      await rm(staging, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Steps 1–5 from the comment above.
    await atomicJson(generationJournal, { name, slug, status: 'building' });
    const result = await command(
      process.execPath,
      [
        path.join(foundation, 'factory/create-app.mjs'),
        staging,
        '--yes',
        '--name',
        name,
        '--slug',
        slug,
        '--bundle-id',
        `com.example.${slug.replaceAll('-', '')}`,
        '--brand-color',
        '#6C5CE7',
      ],
      { cwd: foundation, env },
    );
    if (!result.passed) throw new Error(`App generation failed: ${result.output}`);
    const generatedAt = new Date().toISOString();
    await atomicJson(generationJournal, { name, slug, status: 'complete', generatedAt });
    await rename(staging, workspace);
    await atomicJson(marker, { name, slug, generatedAt });
    return { workspace, name, slug, reused: false };
  }

  /*
   * Acceptance tests. The planner writes them before any code exists, the human approves them
   * as part of the spec, and the orchestrator hands the approved source in here. The file is
   * rewritten from that source at generation and before every check, so nothing done inside
   * the workspace can weaken it.
   */
  function setAcceptanceTests(source) {
    if (typeof source !== 'string' || !source || Buffer.byteLength(source) > MAX_FILE_BYTES)
      throw new Error('Approved acceptance tests are required.');
    acceptanceSource = source;
  }

  async function installAcceptanceTests() {
    if (!acceptanceSource || !(await hasWorkspace())) return false;
    await noSymlinks(workspace, ACCEPTANCE_TESTS, { missing: true });
    await mkdir(path.dirname(path.join(workspace, ACCEPTANCE_TESTS)), { recursive: true });
    await noSymlinks(workspace, ACCEPTANCE_TESTS, { missing: true });
    await writeFile(path.join(workspace, ACCEPTANCE_TESTS), acceptanceSource, 'utf8');
    return true;
  }

  // generate_app = create the app, then install the approved tests so the builder can read them.
  async function generateWithTests(args) {
    const result = await generate(args);
    return { ...result, acceptanceTests: (await installAcceptanceTests()) ? ACCEPTANCE_TESTS : null };
  }

  /**
   * The builder's only way to change code. Allowed: .ts/.tsx under src/features/venture/ and
   * the tab route file. Refused: tests (including the acceptance tests), configs, type stubs.
   * In demo mode, the first feature write gets one deliberate, labeled TypeScript error so
   * the repair loop can be shown.
   */
  async function writeSource({ path: input, content }) {
    const relative = relativeSource(input);
    if (!(await hasWorkspace())) throw new Error('Generate the app before writing feature files.');
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE_BYTES)
      throw new Error('Source content must be text of at most 100 KB.');
    const feature = relative.startsWith('src/features/venture/') && /\.(ts|tsx)$/.test(relative);
    if (
      (!feature && relative !== 'src/app/(tabs)/index.tsx') ||
      /(?:^|\/)(?:jest|babel|metro|eslint|tsconfig)\./.test(relative) ||
      /\.(?:test|spec)\./.test(relative) ||
      /(?:^|\/)__tests__(?:\/|$)/.test(relative) ||
      relative.endsWith('.d.ts')
    )
      throw new Error(
        'Writes are limited to venture feature source and its app route; tests/configuration are prohibited.',
      );
    await noSymlinks(workspace, relative, { missing: true });
    await mkdir(path.dirname(path.join(workspace, relative)), { recursive: true });
    await noSymlinks(workspace, relative, { missing: true });
    let injected = false;
    if (injectFailure && feature) {
      try {
        await writeFile(
          injectionMarker,
          JSON.stringify({ path: relative, fixture: 'typescript-assignment-error' }),
          { flag: 'wx' },
        );
        content +=
          '\n// Demonstration fixture: intentionally injected once by the tool runtime.\nconst agentDemoInjectedFailure: string = 123;\n';
        injected = true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    await writeFile(path.join(workspace, relative), content, 'utf8');
    if (injected)
      await emit('fixture_injected', {
        path: relative,
        description: 'Labeled, one-time TypeScript failure fixture for repair demonstration.',
      });
    return { path: relative, bytes: Buffer.byteLength(content), injectedFailure: injected };
  }

  /**
   * run_checks: three real checks, always the same commands, whatever the agents wrote.
   *   1. generated-source-typecheck   strict TypeScript over the whole app
   *   2. foundation-regression-tests  the foundation's own tests still pass
   *   3. acceptance-tests             the planner's approved tests pass against the builder's code
   * The result goes back to the agent; a failure sends the builder into the repair loop.
   */
  async function verify() {
    if (!(await hasWorkspace())) throw new Error('Generate the app before running checks.');
    const dependencyRoot = path.join(foundation, 'node_modules');
    const tsc = path.join(dependencyRoot, 'typescript/bin/tsc');
    const jest = path.join(dependencyRoot, 'jest/bin/jest.js');
    try {
      await lstat(tsc);
      await lstat(jest);
    } catch {
      throw new Error('Foundation dependencies are missing. Run npm install in the foundation manually.');
    }

    // The app uses the foundation's installed packages through one symlink. If anything else
    // is sitting at node_modules (something the agent could have planted), refuse to run.
    const link = path.join(workspace, 'node_modules');
    try {
      const info = await lstat(link);
      if (!info.isSymbolicLink() || (await realpath(link)) !== (await realpath(dependencyRoot)))
        throw new Error('Untrusted workspace node_modules; refusing checks.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await symlink(dependencyRoot, link, 'dir');
    }
    // These fixed commands never consume model-authored shell strings, npm scripts or Jest configuration.
    const checks = [];
    checks.push({
      name: 'generated-source-typecheck',
      ...(await command(
        process.execPath,
        [tsc, '--noEmit', '--project', path.join(workspace, 'tsconfig.json')],
        { cwd: workspace, env },
      )),
    });
    // Jest config is passed inline, so a jest.config file in the workspace is never used.
    const jestConfig = JSON.stringify({
      rootDir: workspace,
      preset: path.join(dependencyRoot, 'jest-expo'),
      testPathIgnorePatterns: ['/node_modules/', '/ios/'],
      cacheDirectory: path.join(run, 'jest-cache'),
    });
    const runJest = (testPaths) =>
      command(
        process.execPath,
        [jest, '--config', jestConfig, '--runInBand', '--watch=false', '--runTestsByPath', ...testPaths],
        { cwd: workspace, env },
      );
    // The pet module is optional and may not be present in the foundation.
    const baselineTests = [...FOUNDATION_TESTS];
    const petTest = 'src/features/pet/engine.test.ts';
    try {
      await lstat(path.join(foundation, petTest));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      baselineTests.splice(baselineTests.indexOf(petTest), 1);
    }
    checks.push({ name: 'foundation-regression-tests', ...(await runJest(baselineTests)) });

    // Restore the approved test file first, then run it. Missing tests count as a failure.
    if (await installAcceptanceTests()) {
      checks.push({ name: 'acceptance-tests', ...(await runJest([ACCEPTANCE_TESTS])) });
    } else
      checks.push({
        name: 'acceptance-tests',
        passed: false,
        exitCode: null,
        timedOut: false,
        output: 'No approved acceptance tests were supplied.',
        durationMs: 0,
      });
    return {
      ok: checks.every((check) => check.passed),
      checks,
      scope:
        'Strict generated-source typecheck, fixed foundation regression tests and approved planner acceptance tests. Criteria marked for manual review and native behavior require simulator/device review.',
    };
  }

  // Tool name → implementation. `execute` rejects unknown tools and unexpected arguments.
  const handlers = {
    generate_app: generateWithTests,
    list_files: listSources,
    read_file: readSource,
    write_file: writeSource,
    run_checks: verify,
  };
  async function execute(name, args = {}) {
    if (!Object.hasOwn(handlers, name)) throw new Error(`Unknown workspace tool: ${name}`);
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('Tool arguments must be an object.');
    const definition = workspaceToolDefinitions.find((entry) => entry.name === name);
    const allowed = Object.keys(definition.parameters.properties);
    if (
      Object.keys(args).some((key) => !allowed.includes(key)) ||
      definition.parameters.required.some((key) => !Object.hasOwn(args, key))
    ) {
      throw new Error(`Invalid arguments for ${name}.`);
    }
    return handlers[name](args);
  }
  return {
    definitions: workspaceToolDefinitions,
    execute,
    workspace,
    listFiles: listSources,
    readFile: (input) => readSource(typeof input === 'string' ? { path: input } : input),
    verify,
    setAcceptanceTests,
  };
}
