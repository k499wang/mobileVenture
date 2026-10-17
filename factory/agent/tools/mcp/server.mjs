#!/usr/bin/env node
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunStore } from '../../runtime/store.mjs';

const definitions = [
  { name: 'list_artifacts', description: 'List agent artifact names for the selected Venture Studio run.' },
  { name: 'get_artifact', description: 'Read a named structured agent artifact.', inputSchema: { type: 'object', properties: { name: { type: 'string', pattern: '^[a-z_]+$' } }, required: ['name'], additionalProperties: false } },
  { name: 'list_evidence', description: 'Read sourced evidence collected in this run.' },
  { name: 'trace_summary', description: 'Read a bounded execution trace and task status.' },
].map(tool => ({ ...tool, inputSchema: tool.inputSchema ?? { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

export function createRunMcpServer({ foundation, runId }) {
  const store = new RunStore(path.join(foundation, '.agent-runs'));
  store.directory(runId);
  let initialized = false;
  let ready = false;
  return async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    const reply = result => ({ jsonrpc: '2.0', id: message.id, result });
    const error = (code, text) => ({ jsonrpc: '2.0', id: message.id, error: { code, message: text } });
    if (message.method === 'notifications/initialized') { if (initialized) ready = true; return; }
    if (!Object.hasOwn(message, 'id')) return;
    if (message.method === 'initialize') {
      initialized = true;
      const requested = message.params?.protocolVersion;
      return reply({ protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2026-07-28'].includes(requested) ? requested : '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'venture-studio-run-inspector', version: '1.0.0' } });
    }
    if (message.method === 'ping') return reply({});
    if (!ready) return error(-32000, 'Complete initialization before using tools');
    if (message.method === 'tools/list') return reply({ tools: definitions });
    if (message.method !== 'tools/call') return error(-32601, 'Method not found');
    const name = message.params?.name;
    if (!definitions.some(tool => tool.name === name)) return error(-32602, 'Unknown tool');
    try {
      const state = await store.read(runId);
      let result;
      if (name === 'list_artifacts') result = { runId, artifacts: Object.keys(state.artifacts ?? {}) };
      if (name === 'get_artifact') {
        const key = message.params.arguments?.name;
        if (typeof key !== 'string' || !/^[a-z_]+$/.test(key) || !Object.hasOwn(state.artifacts ?? {}, key)) return error(-32602, 'Unknown artifact');
        result = state.artifacts[key];
      }
      if (name === 'list_evidence') result = Object.values(state.artifacts ?? {}).flatMap(artifact => artifact.evidence ?? []);
      if (name === 'trace_summary') result = { runId, status: state.status, tasks: state.tasks, events: (state.events ?? []).slice(-100) };
      const text = JSON.stringify(result);
      if (Buffer.byteLength(text) > 512_000) return reply({ isError: true, content: [{ type: 'text', text: 'Artifact exceeds inspection output limit' }] });
      return reply({ content: [{ type: 'text', text }] });
    } catch { return reply({ isError: true, content: [{ type: 'text', text: 'Run data unavailable' }] }); }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const runId = arg('--run');
  if (!runId) { process.stderr.write('Usage: node factory/agent/tools/mcp/server.mjs --run RUN_ID [--foundation PATH]\n'); process.exitCode = 1; }
  else {
    const handle = createRunMcpServer({ runId, foundation: path.resolve(arg('--foundation') ?? fileURLToPath(new URL('../../../../', import.meta.url))) });
    const lines = createInterface({ input: process.stdin });
    let pending = Promise.resolve();
    lines.on('line', line => {
      pending = pending.then(async () => {
        if (Buffer.byteLength(line) > 64_000) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }) + '\n'); return; }
        let result;
        try { result = await handle(JSON.parse(line)); } catch { result = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
        if (result) process.stdout.write(JSON.stringify(result) + '\n');
      });
    });
  }
}
