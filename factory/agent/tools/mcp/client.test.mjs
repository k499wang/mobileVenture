import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIntegrationRegistry, decodeResponse } from './client.mjs';
import { createRunMcpServer } from './server.mjs';

async function configured(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'venture-mcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, 'integrations.json');
  await writeFile(
    configPath,
    JSON.stringify({
      servers: {
        appgazers: {
          url: 'https://appgazers.com/mcp',
          tokenEnv: 'TOKEN',
          allowedTools: ['search', 'delete'],
          roles: ['competitor'],
        },
      },
    }),
  );
  return createIntegrationRegistry({ configPath, env: { TOKEN: 'secret' }, ...options });
}

test('MCP discovery negotiates session, filters destructive tools, enforces roles, extracts sources', async (t) => {
  const calls = [];
  const registry = await configured(t, {
    fetchImpl: async (_url, options) => {
      const message = JSON.parse(options.body);
      calls.push({ message, headers: options.headers });
      if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202 });
      const result =
        message.method === 'initialize'
          ? { protocolVersion: '2025-11-25' }
          : message.method === 'tools/list'
            ? {
                tools: [
                  { name: 'search', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
                  { name: 'delete', annotations: { destructiveHint: true } },
                ],
              }
            : { content: [{ type: 'text', text: 'Evidence https://example.com/research' }] };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), {
        headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'session-one' },
      });
    },
  });
  await registry.initialize();
  assert.equal(registry.status().find((server) => server.id === 'appgazers').status, 'configured_unverified');
  assert.equal((await registry.toolsForRole('builder')).length, 0);
  assert.equal(calls.length, 0);
  const defs = await registry.toolsForRole('competitor');
  assert.deepEqual(defs[0].parameters.properties.tool.enum, ['search']);
  assert.equal(calls[1].headers['Mcp-Session-Id'], 'session-one');
  await assert.rejects(
    registry.execute(
      'query_research_source',
      { server: 'appgazers', tool: 'search', argumentsJson: '{}' },
      { role: 'builder' },
    ),
    /not allowed/,
  );
  const result = await registry.execute(
    'query_research_source',
    { server: 'appgazers', tool: 'search', argumentsJson: '{}' },
    { role: 'competitor' },
  );
  assert.deepEqual(result.sources, ['https://example.com/research']);
  assert.equal(result.fixture, false);
  assert.equal(JSON.stringify(registry.status()).includes('secret'), false);
});

test('missing OAuth does not call network or claim connection', async (t) => {
  let requests = 0;
  const registry = await configured(t, {
    env: {},
    fetchImpl: async () => {
      requests++;
    },
  });
  await registry.initialize();
  assert.deepEqual(await registry.toolsForRole('competitor'), []);
  assert.equal(registry.status().find((server) => server.id === 'appgazers').status, 'auth_required');
  assert.equal(requests, 0);
});

test('SSE parser handles multi-event responses and rejects oversized output', async () => {
  assert.deepEqual(
    await decodeResponse(
      new Response(
        'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/message"}\n\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ),
    { jsonrpc: '2.0', id: 1, result: {} },
  );
  await assert.rejects(decodeResponse(new Response('x'.repeat(512001))), /output limit/);
});

test('local MCP requires lifecycle and exposes no arbitrary filesystem operations', async () => {
  const handle = createRunMcpServer({ foundation: '/tmp/not-a-run', runId: 'test-run-123' });
  const req = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params });
  assert.equal((await handle(req('tools/list'))).error.code, -32000);
  assert.equal(
    (await handle(req('initialize', { protocolVersion: '2025-11-25' }))).result.serverInfo.name,
    'venture-studio-run-inspector',
  );
  await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const list = (await handle(req('tools/list'))).result.tools;
  assert.equal(list.length, 4);
  assert.ok(list.every((tool) => tool.annotations.readOnlyHint));
  assert.equal(
    (await handle(req('tools/call', { name: 'read_file', arguments: { path: '/etc/passwd' } }))).error.code,
    -32602,
  );
  assert.throws(() => createRunMcpServer({ foundation: '/tmp', runId: '../../secrets' }));
});

test('local stdio MCP host reads selected run artifacts end to end', async (t) => {
  const { mkdir } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = await mkdtemp(path.join(os.tmpdir(), 'venture-stdio-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.agent-runs', 'fixture-run-123'), { recursive: true });
  await writeFile(
    path.join(root, '.agent-runs', 'fixture-run-123', 'state.json'),
    JSON.stringify({
      artifacts: { researcher: { evidence: [{ url: 'https://example.com/real-source', fixture: true }] } },
      events: [],
      tasks: {},
    }),
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./server.mjs', import.meta.url)),
      '--run',
      'fixture-run-123',
      '--foundation',
      root,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  t.after(() => child.kill());
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_evidence', arguments: {} } },
    ]
      .map((item) => JSON.stringify(item))
      .join('\n') + '\n',
  );
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
  });
  const responses = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(responses.length, 2);
  assert.deepEqual(JSON.parse(responses[1].result.content[0].text), [
    { url: 'https://example.com/real-source', fixture: true },
  ]);
});

test('operator discovery reveals tool metadata without granting empty allowlist execution', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'venture-discovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      servers: { appgazers: { url: 'https://appgazers.com/mcp', tokenEnv: 'TOKEN', allowedTools: [] } },
    }),
  );
  const registry = createIntegrationRegistry({
    configPath,
    env: { TOKEN: 'credential-123' },
    fetchImpl: async (_url, options) => {
      const message = JSON.parse(options.body);
      if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202 });
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result:
            message.method === 'initialize'
              ? { protocolVersion: '2025-11-25' }
              : {
                  tools: [
                    {
                      name: 'vendor_real_tool',
                      description: 'Echo credential-123 https://example.com?access_token=credential-123',
                      inputSchema: { type: 'object' },
                      annotations: { readOnlyHint: true },
                    },
                  ],
                },
        }),
      );
    },
  });
  const discovered = await registry.discoverServer('appgazers');
  assert.equal(discovered.tools[0].name, 'vendor_real_tool');
  assert.equal(JSON.stringify(discovered).includes('credential-123'), false);
  assert.deepEqual(await registry.toolsForRole('competitor'), []);
  await assert.rejects(
    registry.execute(
      'query_research_source',
      { server: 'appgazers', tool: 'vendor_real_tool', argumentsJson: '{}' },
      { role: 'competitor' },
    ),
    /not allowed/,
  );
});

test('credential echoes and credential-bearing URLs never reach results or trace events', async (t) => {
  const events = [];
  const registry = await configured(t, {
    onEvent: (event) => events.push(event),
    fetchImpl: async (_url, options) => {
      const message = JSON.parse(options.body);
      if (!Object.hasOwn(message, 'id')) return new Response(null, { status: 202 });
      const result =
        message.method === 'initialize'
          ? { protocolVersion: '2025-11-25' }
          : message.method === 'tools/list'
            ? {
                tools: [
                  { name: 'search', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } },
                ],
              }
            : {
                content: [
                  {
                    type: 'text',
                    text: 'Bearer secret https://example.com/report?access_token=arbitrary-other-credential https://example.com/public',
                  },
                ],
              };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    },
  });
  await registry.toolsForRole('competitor');
  const result = await registry.execute(
    'query_research_source',
    { server: 'appgazers', tool: 'search', argumentsJson: '{}' },
    { role: 'competitor' },
  );
  assert.deepEqual(result.sources, ['https://example.com/public']);
  assert.equal(JSON.stringify([result, events]).includes('secret'), false);
  assert.equal(JSON.stringify([result, events]).includes('arbitrary-other-credential'), false);
});
