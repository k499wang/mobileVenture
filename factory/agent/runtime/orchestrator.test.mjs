import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { VentureStudio } from './orchestrator.mjs';
import { workspaceToolDefinitions } from './tools.mjs';
import { validate, validateReferences, digest } from './validation.mjs';
import { artifactSchemas, demoArtifact } from './roles.mjs';
import { runAgent } from './provider.mjs';

async function harness(options = {}) {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'venture-state-test-'));
  const files = new Map();
  let checks = 0;
  let generations = 0;
  let renders = 0;
  const creativeRenderer = async () => { renders++; return { assets: [], manifestFilename: 'manifest.json' }; };
  const creativeValidator = async () => ({ ok: true, checks: [{ name: 'test-only-creative-pack-fixture', passed: true, detail: 'Fixture result; real PNGs are covered by renderer tests.' }] });
  const launchArchiver = async () => ({ archiveFilename: 'fixture.zip' });
  const workspaceFactory = async ({ injectFailure }) => ({
    definitions: workspaceToolDefinitions, workspace: '/test/workspace',
    execute: async (name, args) => {
      if (name === 'generate_app') { generations++; return { workspace: '/test/workspace' }; }
      if (name === 'read_file') return { path: args.path, content: 'foundation source fixture' };
      if (name === 'write_file') { files.set(args.path, args.content); return { path: args.path }; }
      if (name === 'run_checks') {
        checks++;
        const passed = !injectFailure || checks > 1;
        return { ok: passed, checks: [{ name: 'test-only-verification-fixture', passed, output: passed ? 'fixture pass' : 'fixture TS2322' }] };
      }
      throw new Error(`Unexpected tool: ${name}`);
    },
  });
  return { studio: new VentureStudio({ runsDir, workspaceFactory, creativeRenderer, creativeValidator, launchArchiver, ...options }), files, getChecks: () => checks, getGenerations: () => generations, getRenders: () => renders,
    runsDir, workspaceFactory, creativeRenderer, creativeValidator, launchArchiver };
}

test('parallel research, critique follow-up, hash approval and repair complete with persisted traces', async () => {
  const { studio, getChecks, getGenerations, getRenders } = await harness();
  const run = await studio.create({ brief: 'Investigate flexible routines for changing work schedules.', injectFailure: true });
  await studio.start(run.id);
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(run.round, 1);
  assert.equal(getGenerations(), 0, 'no source generation before approval');
  assert.equal(getRenders(), 0, 'no ad exports before specification approval');
  assert.equal(run.artifacts.critic.verdict, 'accept');
  await assert.rejects(studio.approve(run.id, 'outdated-hash'), /changed/);
  await studio.approve(run.id, run.specHash);
  await studio.start(run.id);
  assert.equal(run.status, 'completed');
  assert.equal(run.repairAttempt, 1);
  assert.equal(getChecks(), 2);
  assert.equal(getGenerations(), 1);
  assert.equal(Object.keys(run.artifacts).length, 13);
  assert.equal(run.artifacts.persona.personas.length, 2);
  assert.equal(run.artifacts.creative.creatives.length, 10);
  assert.equal(run.artifacts.creative_qa.verdict, 'pass');
  assert.equal(run.budget.requests, 0, 'fixture runs never claim real model usage');
  assert(run.events.some(event => event.type === 'repair_requested'));
  assert.equal((await studio.store.read(run.id)).status, 'completed');
});

test('checkpoint resumes under a new supervisor without rerunning completed research', async () => {
  const { studio, runsDir, workspaceFactory, creativeRenderer, creativeValidator, launchArchiver } = await harness();
  const run = await studio.create({ brief: 'Research a practical routine tracker for variable schedules.' });
  await studio.start(run.id);
  const completedResearchAttempts = run.tasks.researcher.attempt;
  const restarted = new VentureStudio({ runsDir, workspaceFactory, creativeRenderer, creativeValidator, launchArchiver });
  await restarted.approve(run.id, run.specHash);
  const result = await restarted.start(run.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.tasks.researcher.attempt, completedResearchAttempts);
});

test('pause stops at checkpoint and resume preserves run identity', async () => {
  const { studio } = await harness();
  const run = await studio.create({ brief: 'Investigate an app for changing schedules and flexible routines.' });
  await studio.pause(run.id);
  await studio.start(run.id);
  assert.equal(run.status, 'paused');
  assert.equal(Object.keys(run.tasks).length, 0);
  await studio.resume(run.id);
  await studio.start(run.id);
  assert.equal(run.status, 'awaiting_approval');
  assert.equal(run.id, (await studio.store.read(run.id)).id);
});

test('supervisor rejects researcher attempts to use builder tools', async () => {
  let denied;
  const provider = async input => {
    if (input.role === 'researcher') denied = await input.execute('write_file', { path: 'src/features/venture/attack.ts', content: '' });
    return runAgent(input);
  };
  const { studio, files } = await harness({ provider });
  const run = await studio.create({ brief: 'Research flexible routine applications with real tool boundaries.' });
  await studio.start(run.id);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Permission denied/);
  assert.equal(files.size, 0);
  assert(run.events.some(event => event.type === 'tool_rejected'));
});

test('approval cannot authorize a changed specification', async () => {
  const { studio } = await harness();
  const run = await studio.create({ brief: 'Research opportunities for flexible everyday routine tools.' });
  await studio.start(run.id);
  const oldHash = run.specHash;
  run.artifacts.planner.name = 'Changed after review';
  assert.notEqual(digest(run.artifacts.planner), oldHash);
  await assert.rejects(studio.approve(run.id, oldHash), /changed/);
});

test('artifact schema and provenance reject invented sources and dangling references', () => {
  assert.throws(() => validate(artifactSchemas.critic, { verdict: 'accept', summary: 'ok', issues: [], followUpQueries: [], extra: true }), /unknown field/);
  const research = demoArtifact('researcher');
  research.evidence[0].fixture = false;
  assert.throws(() => validateReferences('researcher', research, {}, { mode: 'live', sources: [] }), /not returned by web search/);
  assert.throws(() => validateReferences('analyst', demoArtifact('analyst'), {}, { mode: 'demo' }), /Unknown evidence reference/);
});

test('live mode cannot silently use fixtures when credentials are absent', async () => {
  const { studio } = await harness({ model: '', apiKey: '' });
  await assert.rejects(studio.create({ brief: 'Research flexible routines for irregular working hours.', mode: 'live' }), /requires/);
});
