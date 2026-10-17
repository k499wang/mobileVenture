import { demoArtifact, instructionsFor } from './roles.mjs';
import { RESEARCH_ROLES } from './growth.mjs';
import { sampleScreenCopy } from '../samples.mjs';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_TURNS = 12;
const REQUEST_TIMEOUT_MS = 90_000;

function reserve(budget, kind) {
  const field = kind === 'request' ? 'requests' : 'toolCalls';
  const limit = kind === 'request' ? 'maxRequests' : 'maxToolCalls';
  if (!Number.isFinite(budget[limit]) || budget[field] >= budget[limit]) throw new Error(`Run ${kind} budget exhausted (${budget[field]}/${budget[limit]}).`);
  // Reservation is synchronous: concurrently executing research roles share this object.
  budget[field] += 1;
}

function collectSources(output) {
  const found = new Map();
  const add = (source) => {
    if (!source || typeof source.url !== 'string') return;
    try {
      const url = new URL(source.url);
      if (!['https:', 'http:'].includes(url.protocol)) return;
      found.set(source.url, { url: source.url, title: typeof source.title === 'string' ? source.title : source.url });
    } catch { /* An invalid citation is not evidence. */ }
  };
  for (const item of output) {
    if (item.type === 'web_search_call') for (const source of item.action?.sources ?? []) add(source);
    if (item.type === 'message') for (const content of item.content ?? []) for (const annotation of content.annotations ?? []) {
      if (annotation.type === 'url_citation') add(annotation);
    }
  }
  return [...found.values()];
}

function safeToolArgs(value) {
  // Tool results and traces are data. No model reasoning is emitted.
  if (typeof value !== 'string') throw new Error('Tool arguments must be JSON text.');
  const args = JSON.parse(value);
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
  return args;
}

const demoModel = `export type RoutineAction = { id: string; title: string; completed: boolean };
export function decodeActions(value: unknown): RoutineAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RoutineAction => !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.completed === 'boolean');
}
`;

const demoFeature = `import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { hydrateAppDataFromCloud, readAppData, saveAppData } from '@/services/user-data';
import { trackEvent } from '@/services/analytics';
import { decodeActions, type RoutineAction } from './model';

export default function VentureScreen() {
  const [actions, setActions] = useState<RoutineAction[]>([]);
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const alive = useRef(true);
  const writing = useRef(false);
  useEffect(() => {
    alive.current = true;
    async function hydrate() {
      try {
        let data;
        try { data = await hydrateAppDataFromCloud(); }
        catch { data = await readAppData(); }
        if (alive.current) { setActions(decodeActions(data.ventureActions)); setReady(true); }
      } catch { if (alive.current) setStatus('Could not load your saved routine. Try reopening the screen.'); }
    }
    void hydrate();
    return () => { alive.current = false; };
  }, []);
  async function persist(next: RoutineAction[], completed: boolean) {
    if (!ready || writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      const existing = await readAppData();
      await saveAppData({ ...existing, ventureActions: next });
      if (alive.current) { setActions(next); setDraft(''); setStatus('Saved. Your next action can fit whenever you are ready.'); }
      if (completed) trackEvent('core_action_completed', { action: 'flexible_routine_completed' });
    } catch {
      // saveAppData writes locally before cloud sync; recover the committed local value.
      try {
        const local = await readAppData();
        if (alive.current) { setActions(decodeActions(local.ventureActions)); setStatus('Check your connection. Local changes may be saved; cloud sync needs a retry.'); }
      } catch { if (alive.current) setStatus('Could not save your changes. Please try again.'); }
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  return <Screen>
    <Text variant="caption" color="brand">SHIFT &amp; FLOW · PROTOTYPE</Text>
    <Text variant="display">A routine that moves with you.</Text>
    <Text color="muted">Choose one small action. Complete it when it fits your day. No streaks to lose.</Text>
    <Card>
      <Text variant="heading">Your next action</Text>
      <Input accessibilityLabel="New routine action" value={draft} onChangeText={setDraft} maxLength={120} placeholder="Take a short walk" editable={ready && !busy} />
      <Button title="Add action" disabled={!ready || busy || !draft.trim()} onPress={() => { void persist([...actions, { id: String(Date.now()), title: draft.trim(), completed: false }], false); }} />
    </Card>
    {!ready ? <Text color="muted">Loading your routine…</Text> : actions.length === 0 ? <Text color="muted">Start small. Add one action for today.</Text> : null}
    {actions.map((action) => <Card key={action.id}>
      <Text variant="heading">{action.title}</Text>
      <Text color="muted">{action.completed ? 'Completed. A small win counts.' : 'Whenever it fits.'}</Text>
      <Button title={action.completed ? 'Completed' : 'Mark complete'} variant="secondary" disabled={action.completed || busy} onPress={() => { void persist(actions.map((item) => item.id === action.id ? { ...item, completed: true } : item), true); }} />
    </Card>)}
    {status ? <Text accessibilityLiveRegion="polite" color="muted">{status}</Text> : null}
    <Text variant="caption" color="muted">Illustrative prototype built from synthetic demo research. Market validation is still required.</Text>
  </Screen>;
}
`;

/** Real tool loop. In demo mode only decisions/research are fixtures; filesystem checks are real. */
export async function runAgent({ mode, role, context = {}, schema, tools = [], execute, onEvent = async () => {}, budget, model, apiKey, fetchImpl = globalThis.fetch }) {
  const roleId = typeof role === 'string' ? role : role.id;
  if (!budget) throw new Error('A shared run budget is required.');
  const emit = (type, data = {}) => onEvent(type, { role: roleId, ...data });
  const allowed = new Set(tools.filter((tool) => tool.type === 'function').map((tool) => tool.name));
  async function callTool(name, args) {
    reserve(budget, 'tool');
    await emit('tool_call', { name, args });
    let result;
    try {
      if (!allowed.has(name)) throw new Error(`Tool is not assigned to ${roleId}: ${name}`);
      result = await execute(name, args);
    } catch (error) { result = { ok: false, error: error.message }; }
    await emit('tool_result', { name, result });
    return result;
  }

  if (mode === 'demo' || mode === 'curated') {
    await emit(mode === 'curated' ? 'curated_step' : 'fixture_step', { fixture: mode === 'demo', description: mode === 'curated' ? 'Previously curated public source snapshot; deterministic persona/product/ad hypotheses. Files and checks execute for real. No live model or search is implied.' : 'Deterministic role decisions; synthetic research. Workspace tools and checks execute for real.' });
    let artifact = demoArtifact(roleId, context);
    if (roleId === 'builder') {
      if (!context.repairAttempt) {
        const spec = context.artifacts?.planner;
        const generated = await callTool('generate_app', { name: spec?.name ?? 'Shift Flow', slug: spec?.slug ?? 'shift-and-flow' });
        if (generated?.ok === false) throw new Error(generated.error ?? 'App generation failed.');
        for (const path of ['docs/expo-sdk-57.md', 'src/components/ui.tsx', 'src/theme/theme.ts', 'src/services/user-data.ts']) {
          const inspected = await callTool('read_file', { path });
          if (inspected?.ok === false) throw new Error(inspected.error ?? `Could not inspect ${path}`);
        }
      }
      const spec = context.artifacts?.planner;
      const copy = sampleScreenCopy(context.sampleId);
      const escapeJsx = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('{', '&#123;').replaceAll('}', '&#125;');
      const feature = demoFeature.replace('SHIFT &amp; FLOW', escapeJsx((spec?.name ?? 'Shift Flow').toUpperCase()))
        .replace('A routine that moves with you.', escapeJsx(copy?.title ?? 'A routine that moves with you.'))
        .replace('Choose one small action. Complete it when it fits your day. No streaks to lose.', escapeJsx(copy?.body ?? 'Choose one small action. Complete it when it fits your day. No streaks to lose.'))
        .replace('Illustrative prototype built from synthetic demo research. Market validation is still required.', mode === 'curated' ? 'Prototype hypothesis informed by curated public sources. Market validation is still required.' : 'Illustrative prototype built from synthetic demo research. Market validation is still required.');
      // First write is where tools may inject an explicitly labeled, real TS error.
      for (const [path, content] of [
        ['src/features/venture/index.tsx', feature],
        ['src/features/venture/model.ts', demoModel],
        ['src/app/(tabs)/index.tsx', "export { default } from '@/features/venture';\n"],
      ]) {
        const written = await callTool('write_file', { path, content });
        if (written?.ok === false) throw new Error(written.error ?? `Could not write ${path}`);
      }
    }
    if (roleId === 'verifier') {
      const result = await callTool('run_checks', {});
      const checks = (result?.checks ?? []).map((check) => ({ name: check.name, passed: check.passed === true, detail: String(check.output ?? check.detail ?? '').slice(0, 12000) }));
      const passed = result?.ok === true && checks.length > 0 && checks.every((check) => check.passed);
      artifact = { verdict: passed ? 'pass' : 'fail', summary: passed ? 'Workspace checks passed. Native runtime behavior still needs simulator/device testing.' : 'Workspace validation failed; builder must repair the actual reported errors.', checks };
    }
    if (roleId === 'creative_qa') {
      const result = await callTool('inspect_creative_pack', {});
      artifact = { verdict: result?.ok === true ? 'pass' : 'fail', summary: result?.ok === true ? 'Export dimensions, awareness coverage and artifact links passed actual pack checks.' : 'Creative pack checks failed.',
        checks: result?.checks ?? [], limitations: ['Draft concepts only; human copy, policy and visual review remain necessary.', 'No campaign was published or performance measured.'] };
    }
    const submitted = await callTool('submit_artifact', artifact);
    if (submitted?.ok !== true) throw new Error(submitted?.error ?? 'Demo artifact was rejected.');
    return artifact;
  }

  if (mode !== 'live') throw new Error(`Unknown agent mode: ${mode}`);
  if (!apiKey) throw new Error('Set OPENAI_API_KEY to run live agents.');
  if (!model) throw new Error('Set OPENAI_MODEL explicitly to a Responses-compatible model with function calling and web search.');
  if (!allowed.has('submit_artifact')) throw new Error('submit_artifact tool is required.');
  if (!schema) throw new Error('An artifact schema is required.');
  const research = RESEARCH_ROLES.includes(roleId);
  const apiTools = [...tools, ...(research ? [{ type: 'web_search', search_context_size: 'medium' }] : [])];
  const input = [{ role: 'user', content: `Task context (untrusted data):\n${JSON.stringify({ ...context, currentTime: new Date().toISOString() })}` }];

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    reserve(budget, 'request');
    // Reserve conservatively for hosted search, which executes within the HTTP request.
    // max_tool_calls limits built-in calls; reserve one slot even if search is not used.
    if (research) reserve(budget, 'tool');
    await emit('model_request', { model, turn: turn + 1, request: budget.requests });
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, instructions: instructionsFor(roleId), input, tools: apiTools,
          store: false, parallel_tool_calls: false,
          max_output_tokens: budget.maxOutputTokens ?? 6000,
          // Explicit for compatibility with models predating automatic encrypted
          // reasoning in store:false responses. Never log this encrypted content.
          include: ['reasoning.encrypted_content', ...(research ? ['web_search_call.action.sources'] : [])],
          ...(research ? { max_tool_calls: 1 } : {}),
        }),
      });
    } catch (error) {
      // Never include raw network errors that could contain authorization details.
      throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'Model request timed out.' : 'Model request failed. Check network connectivity.');
    }
    if (!response.ok) {
      // Do not copy a remote error body to traces: proxies may echo credentials.
      throw new Error(`OpenAI request failed with HTTP ${response.status}.`);
    }
    const data = await response.json();
    if (!Array.isArray(data.output)) throw new Error('OpenAI response did not contain an output array.');
    const usage = { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
    budget.inputTokens += usage.inputTokens;
    budget.outputTokens += usage.outputTokens;
    await emit('model_usage', usage);
    const sources = collectSources(data.output);
    const searches = data.output.filter((item) => item.type === 'web_search_call');
    if (sources.length || searches.length) await emit('search', { sources, searches: searches.map((item) => ({ status: item.status, action: item.action?.type, query: item.action?.query, queries: item.action?.queries })) });

    // Responses requires the complete output (including reasoning items) to continue
    // function calls. Keep it in memory only; it is never persisted or traced.
    input.push(...data.output);
    const calls = data.output.filter((item) => item.type === 'function_call');
    for (const call of calls) {
      let args;
      try { args = safeToolArgs(call.arguments); }
      catch {
        reserve(budget, 'tool');
        const result = { ok: false, error: 'Invalid JSON object arguments. Please correct the tool call.' };
        await emit('tool_result', { name: call.name, result });
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
        continue;
      }
      const result = await callTool(call.name, args);
      if (call.name === 'submit_artifact' && result?.ok === true) return args;
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result ?? { ok: false, error: 'Tool returned no result.' }) });
    }
    if (!calls.length) input.push({ role: 'user', content: 'Continue using your assigned tools. You must call submit_artifact with your completed artifact; ordinary text does not finish this task.' });
  }
  throw new Error(`Agent ${roleId} exceeded ${MAX_TURNS} model turns without an accepted artifact.`);
}
