#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { VentureStudio } from './runtime/orchestrator.mjs';
import { createStudioServer } from './server.mjs';
import { SAMPLES } from './samples.mjs';
import { CURATED_VERSION } from './research/index.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'serve';
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`--${name} requires a value.`);
  return args[index + 1];
}

async function main() {
  const studio = new VentureStudio();
  if (command === 'samples') {
    const selected = flag('sample', 'all');
    const samples = selected === 'all' ? SAMPLES : SAMPLES.filter(item => item.id === selected);
    if (!samples.length) throw new Error('Unknown sample ID.');
    const existing = await studio.store.list();
    for (const sample of samples) {
      const prior = existing.find(run => run.sampleId === sample.id && run.curatedVersion === CURATED_VERSION && run.status === 'completed');
      if (prior && !args.includes('--fresh')) { process.stdout.write(`Reusing ${sample.name}: ${prior.id}\n`); continue; }
      const state = await studio.create({ sampleId: sample.id, autoApprove: true });
      process.stdout.write(`Seeding ${sample.name}: ${state.id}\n`);
      const result = await studio.start(state.id);
      printResult(result);
      if (result.status !== 'completed') return;
    }
    return;
  }
  if (command === 'serve') {
    // Recover interrupted processes at a checkpoint. A live lock belongs to a
    // separate CLI/server and must never be silently taken over.
    for (const state of await studio.store.list()) {
      if (state.status !== 'running') continue;
      let live = false;
      try {
        const pid = Number(await readFile(path.join(studio.store.directory(state.id), 'run.lock'), 'utf8'));
        process.kill(pid, 0); live = true;
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
      if (!live) {
        state.status = 'paused'; state.pauseRequested = false;
        await studio.event(state, 'supervisor', 'interrupted_run_recovered', { stage: state.stage, note: 'Resume from the last committed task.' });
      }
    }
    const port = Number(flag('port', '4317'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.');
    const server = createStudioServer(studio);
    server.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      process.stdout.write(`\nVenture Studio  http://127.0.0.1:${port}\nDemo mode available. Live mode: ${studio.liveAvailable ? `enabled (${studio.model})` : 'set OPENAI_API_KEY and OPENAI_MODEL on the server'}\n`);
    });
    return;
  }
  if (command === 'run') {
    const state = await studio.create({
      brief: flag('brief', 'Investigate habit apps for people with irregular schedules. Propose a differentiated flexible routine tracker and build a small iOS prototype.'),
      mode: flag('mode', 'demo'), injectFailure: args.includes('--inject-failure'), autoApprove: args.includes('--auto-approve'),
    });
    process.stdout.write(`Run ${state.id} (${state.mode})\n`);
    const result = await studio.start(state.id);
    printResult(result);
    return;
  }
  if (command === 'resume') {
    const id = args[1];
    const state = await studio.get(id);
    if (state.status === 'awaiting_approval') await studio.approve(id, flag('approve', ''));
    else await studio.resume(id);
    printResult(await studio.start(id));
    return;
  }
  if (command === 'inspect') {
    const state = await studio.get(args[1]);
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  if (command === 'help' || args.includes('--help')) {
    process.stdout.write('Commands:\n  serve [--port 4317]\n  samples [--sample SAMPLE_ID] [--fresh]\n  run --mode demo|live [--brief "..."] [--auto-approve] [--inject-failure]\n  resume RUN_ID [--approve SPEC_HASH]\n  inspect RUN_ID\n');
    return;
  }
  throw new Error(`Unknown command: ${command}. Use help.`);
}

function printResult(state) {
  process.stdout.write(`Status: ${state.status}\nStage: ${state.stage}\n${state.workspace ? `Workspace: ${state.workspace}\n` : ''}`);
  if (state.creativePack) process.stdout.write(`Creative concepts: ${state.artifacts.creative?.creatives.length ?? 0}\nExported assets: ${state.creativePack.assets.length}\nLaunch pack: .agent-runs/${state.id}/creatives/${state.creativePack.archiveFilename ?? 'manifest.json'}\n`);
  if (state.status === 'awaiting_approval') process.stdout.write(`Review: .agent-runs/${state.id}/state.json\nApprove: node factory/agent/cli.mjs resume ${state.id} --approve ${state.specHash}\n`);
  if (state.error) { process.stderr.write(`${state.error}\n`); process.exitCode = 1; }
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
