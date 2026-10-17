import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { runAgent } from './provider.mjs';
import { artifactSchemas, demoArtifact, ROLES } from './roles.mjs';

const makeBudget = (overrides = {}) => ({
  maxRequests: 40,
  requests: 0,
  maxToolCalls: 100,
  toolCalls: 0,
  maxOutputTokens: 6000,
  inputTokens: 0,
  outputTokens: 0,
  ...overrides,
});
const tool = (name) => ({
  type: 'function',
  name,
  description: name,
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  strict: true,
});
const output = (name, args, id = 'c1') => ({
  type: 'function_call',
  name,
  arguments: JSON.stringify(args),
  call_id: id,
});
const http = (items, usage = {}) => ({ ok: true, json: async () => ({ output: items, usage }) });
const base = (overrides = {}) => ({
  mode: 'live',
  role: 'analyst',
  context: { brief: 'Flexible habits' },
  schema: artifactSchemas.analyst,
  tools: [tool('submit_artifact')],
  execute: async () => ({ ok: true }),
  budget: makeBudget(),
  model: 'test-model',
  apiKey: 'test-key',
  ...overrides,
});

test('continues Responses function loop, keeps output context, and waits for validated submission', async () => {
  const requests = [];
  const events = [];
  const artifact = demoArtifact('analyst');
  const reasoning = {
    type: 'reasoning',
    id: 'rs1',
    summary: [],
    encrypted_content: 'opaque-encrypted-reasoning',
  };
  const config = base({
    tools: [tool('read_file'), tool('submit_artifact')],
    onEvent: async (type, data) => events.push({ type, data }),
    execute: async (name, args) =>
      name === 'read_file'
        ? { ok: true, content: 'contract' }
        : args.summary === 'invalid'
          ? { ok: false, error: 'Schema rejected' }
          : { ok: true },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      requests.push(JSON.parse(options.body));
      if (requests.length === 1)
        return http([reasoning, output('read_file', { path: 'src/components/ui.tsx' })], {
          input_tokens: 10,
          output_tokens: 2,
        });
      if (requests.length === 2) return http([output('submit_artifact', { summary: 'invalid' }, 'c2')]);
      return http([output('submit_artifact', artifact, 'c3')]);
    },
  });
  assert.deepEqual(await runAgent(config), artifact);
  assert.equal(requests.length, 3);
  assert.ok(requests[1].input.some((item) => item.type === 'reasoning' && item.id === 'rs1'));
  assert.equal(
    requests[1].input.find((item) => item.type === 'reasoning').encrypted_content,
    'opaque-encrypted-reasoning',
  );
  assert.ok(
    requests[2].input.some(
      (item) => item.type === 'function_call_output' && JSON.parse(item.output).error === 'Schema rejected',
    ),
  );
  assert.equal(config.budget.requests, 3);
  assert.equal(config.budget.toolCalls, 3);
  assert.equal(config.budget.inputTokens, 10);
  assert.equal(config.budget.outputTokens, 2);
  assert.equal(JSON.stringify(events).includes('test-key'), false);
  assert.equal(JSON.stringify(events).includes('rs1'), false);
  assert.equal(JSON.stringify(events).includes('opaque-encrypted-reasoning'), false);
  assert.equal(requests[0].store, false);
  assert.ok(requests[0].include.includes('reasoning.encrypted_content'));
});

test('parallel agents cannot exceed the shared request reservation', async () => {
  const budget = makeBudget({ maxRequests: 1 });
  let requestCount = 0;
  const config = base({
    budget,
    fetchImpl: async () => {
      requestCount += 1;
      return http([output('submit_artifact', demoArtifact('analyst'))]);
    },
  });
  const results = await Promise.allSettled([runAgent(config), runAgent(config)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(requestCount, 1);
  assert.equal(budget.requests, 1);
  assert.match(
    results.find((result) => result.status === 'rejected').reason.message,
    /request budget exhausted/,
  );
});

test('unassigned tool is rejected and cannot execute; model can correct', async () => {
  let turn = 0;
  const executed = [];
  const config = base({
    execute: async (name) => {
      executed.push(name);
      return { ok: true };
    },
    fetchImpl: async () =>
      http([
        ++turn === 1 ? output('publish_app', {}) : output('submit_artifact', demoArtifact('analyst'), 'c2'),
      ]),
  });
  await runAgent(config);
  assert.deepEqual(executed, ['submit_artifact']);
  assert.equal(config.budget.toolCalls, 2);
});

test('malformed tool JSON returns corrective feedback instead of executing', async () => {
  const requests = [];
  const config = base({
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      return requests.length === 1
        ? http([{ type: 'function_call', name: 'submit_artifact', arguments: '{', call_id: 'bad' }])
        : http([output('submit_artifact', demoArtifact('analyst'))]);
    },
  });
  await runAgent(config);
  assert.match(
    requests[1].input.find((item) => item.call_id === 'bad' && item.type === 'function_call_output').output,
    /Invalid JSON/,
  );
});

test('web search is researcher-only and emits source provenance from citations and source lists', async () => {
  const events = [];
  const requests = [];
  await runAgent(
    base({
      role: 'researcher',
      schema: artifactSchemas.researcher,
      onEvent: async (type, data) => events.push({ type, data }),
      fetchImpl: async (_, options) => {
        requests.push(JSON.parse(options.body));
        return http([
          {
            type: 'web_search_call',
            status: 'completed',
            action: {
              type: 'search',
              query: 'flexible habits',
              sources: [{ url: 'https://source.example/a', title: 'A' }],
            },
          },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Cited research',
                annotations: [{ type: 'url_citation', url: 'https://source.example/b', title: 'B' }],
              },
            ],
          },
          output('submit_artifact', demoArtifact('researcher')),
        ]);
      },
    }),
  );
  assert.ok(requests[0].tools.some((entry) => entry.type === 'web_search'));
  assert.equal(requests[0].max_tool_calls, 1);
  assert.deepEqual(
    events.find((entry) => entry.type === 'search').data.sources.map((source) => source.url),
    ['https://source.example/a', 'https://source.example/b'],
  );
  let nonResearchRequest;
  await runAgent(
    base({
      fetchImpl: async (_, options) => {
        nonResearchRequest = JSON.parse(options.body);
        return http([output('submit_artifact', demoArtifact('analyst'))]);
      },
    }),
  );
  assert.equal(
    nonResearchRequest.tools.some((entry) => entry.type === 'web_search'),
    false,
  );
});

test('enforces tool budget before execution and redacts remote errors', async () => {
  let executed = false;
  await assert.rejects(
    runAgent(
      base({
        budget: makeBudget({ maxToolCalls: 0 }),
        execute: async () => {
          executed = true;
        },
        fetchImpl: async () => http([output('submit_artifact', {})]),
      }),
    ),
    /tool budget exhausted/,
  );
  assert.equal(executed, false);
  await assert.rejects(
    runAgent(
      base({
        fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'test-key secret echoed' }),
      }),
    ),
    (error) => error.message === 'OpenAI request failed with HTTP 401.',
  );
  await assert.rejects(runAgent(base({ model: undefined })), /OPENAI_MODEL/);
});

test('demo verifier uses actual check verdict and demo builder edits via constrained tools', async () => {
  const calls = [];
  const config = base({
    mode: 'demo',
    role: 'builder',
    tools: ['generate_app', 'read_file', 'write_file', 'submit_artifact'].map(tool),
    execute: async (name, args) => {
      calls.push({ name, args });
      return { ok: true };
    },
  });
  const artifact = await runAgent(config);
  assert.equal(calls[0].name, 'generate_app');
  assert.ok(calls.some((entry) => entry.name === 'read_file' && entry.args.path === 'docs/expo-sdk-57.md'));
  assert.equal(
    calls.find((entry) => entry.name === 'write_file').args.path,
    'src/features/venture/index.tsx',
  );
  assert.equal(
    artifact.files.some((path) => path.includes('.test.')),
    false,
  );
  assert.equal(config.budget.requests, 0);
  const verified = await runAgent(
    base({
      mode: 'demo',
      role: 'verifier',
      tools: ['run_checks', 'submit_artifact'].map(tool),
      execute: async (name) =>
        name === 'run_checks'
          ? {
              ok: false,
              checks: [{ name: 'typecheck', passed: false, output: 'TS2322 actual fixture error' }],
            }
          : { ok: true },
    }),
  );
  assert.equal(verified.verdict, 'fail');
  assert.match(verified.checks[0].detail, /TS2322/);
});

test('all roles have schemas; demo research is explicit synthetic evidence and critic requests follow-up', () => {
  for (const role of ROLES) assert.ok(artifactSchemas[role.id]);
  for (const role of ['researcher', 'competitor'])
    for (const item of demoArtifact(role).evidence) {
      assert.equal(item.fixture, true);
      assert.ok(new URL(item.url).hostname.endsWith('.example'));
    }
  assert.equal(demoArtifact('critic', { round: 0 }).verdict, 'revise');
  assert.equal(demoArtifact('critic', { round: 1 }).verdict, 'accept');
});

test('generated feature never overwrites saved data when initial cloud and local reads fail', async () => {
  let source;
  await runAgent(
    base({
      mode: 'demo',
      role: 'builder',
      tools: ['generate_app', 'read_file', 'write_file', 'submit_artifact'].map(tool),
      execute: async (name, args) => {
        if (name === 'write_file' && args.path === 'src/features/venture/index.tsx') source = args.content;
        return { ok: true };
      },
    }),
  );
  // Render the trusted demo template with a small hook/UI adapter, so this test
  // exercises its asynchronous failure behavior without launching React Native.
  const slots = [];
  const effects = [];
  let cursor = 0;
  let mounted = false;
  let writes = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (next) => {
          slots[index] = next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect) {
      if (!mounted) effects.push(effect);
    },
  };
  const storage = {
    hydrateAppDataFromCloud: async () => {
      throw new Error('offline');
    },
    readAppData: async () => {
      throw new Error('storage temporarily unavailable');
    },
    saveAppData: async () => {
      writes++;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/ui': Object.fromEntries(
      ['Button', 'Card', 'Input', 'Screen', 'Text'].map((name) => [name, name]),
    ),
    '@/services/user-data': storage,
    '@/services/analytics': { trackEvent() {} },
    './model': {
      decodeActions: (value) => (Array.isArray(value) ? value : []),
      addAction: (actions, title, id) =>
        title.trim() ? [...actions, { id, title: title.trim(), completed: false }] : actions,
      completeAction: (actions, id) =>
        actions.map((item) => (item.id === id ? { ...item, completed: true } : item)),
    },
  };
  const exported = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: exported,
      require: (name) => {
        assert.ok(name in dependencies);
        return dependencies[name];
      },
    },
  );
  exported.default();
  mounted = true;
  effects.forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  cursor = 0;
  const tree = exported.default();
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  }
  const add = nodes(tree).find((node) => node.type === 'Button' && node.props.title === 'Add action');
  assert.equal(add.props.disabled, true);
  add.props.onPress(); // Even accidental programmatic invocation remains guarded.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 0);
});
