import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RunStore } from './store.mjs';
import { ROLES, artifactSchemas } from './roles.mjs';
import { runAgent } from './provider.mjs';
import { createWorkspaceTools } from './tools.mjs';
import { digest, validate, validateReferences } from './validation.mjs';

const dependencies = {
  researcher: ['critic'], competitor: ['critic'], analyst: ['researcher', 'competitor'],
  critic: ['researcher', 'competitor', 'analyst'], planner: ['researcher', 'competitor', 'analyst', 'critic'],
  builder: ['planner'], verifier: ['planner', 'builder'], experimenter: ['planner', 'analyst'],
};

/** Deterministic supervisor: models own bounded tasks; code owns transitions and permissions. */
export class VentureStudio {
  constructor({ foundationDir, runsDir, provider = runAgent, workspaceFactory = createWorkspaceTools, model = process.env.OPENAI_MODEL, apiKey = process.env.OPENAI_API_KEY } = {}) {
    this.foundationDir = path.resolve(foundationDir ?? path.join(import.meta.dirname, '../..'));
    this.store = new RunStore(runsDir ?? path.join(this.foundationDir, '.agent-runs'));
    this.provider = provider;
    this.workspaceFactory = workspaceFactory;
    this.model = model;
    this.apiKey = apiKey;
    this.active = new Map();
    this.states = new Map();
  }
  get liveAvailable() { return Boolean(this.apiKey && this.model); }
  async get(id) { return this.states.get(id) ?? this.store.read(id); }
  async event(state, role, type, data = {}) {
    // Trace user-visible tool activity, never credentials or hidden model reasoning.
    const safe = JSON.parse(JSON.stringify(data, (_key, value) => {
      if (typeof value !== 'string') return value;
      return this.apiKey ? value.replaceAll(this.apiKey, '[REDACTED]') : value;
    }));
    state.events.push({ id: state.events.length + 1, at: new Date().toISOString(), role, type, data: safe });
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
  }
  async create({ brief, mode = 'demo', injectFailure = false, autoApprove = false } = {}) {
    if (typeof brief !== 'string' || brief.trim().length < 12 || brief.length > 6000) throw new Error('Enter a brief between 12 and 6,000 characters.');
    if (!['demo', 'live'].includes(mode)) throw new Error('Choose demo or live mode.');
    if (mode === 'live' && !this.liveAvailable) throw new Error('Live mode requires server-side OPENAI_API_KEY and OPENAI_MODEL.');
    if (mode === 'live' && injectFailure) throw new Error('Failure injection is available only in fixture demo mode.');
    const state = {
      id: randomUUID(), brief: brief.trim(), mode, injectFailure: Boolean(injectFailure), autoApprove: Boolean(autoApprove),
      status: 'running', stage: 'research', round: 0, repairAttempt: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      artifacts: {}, tasks: {}, events: [], sources: {}, approvedHash: null, specHash: null,
      budget: { requests: 0, maxRequests: 40, toolCalls: 0, maxToolCalls: 100, maxOutputTokens: 6000, inputTokens: 0, outputTokens: 0 },
      workspace: null, verification: null, error: null, pauseRequested: false,
    };
    this.states.set(state.id, state);
    await this.event(state, 'supervisor', 'run_created', { mode, brief: state.brief, fixture: mode === 'demo' });
    return state;
  }
  async workspace(state) {
    return this.workspaceFactory({ runDir: this.store.directory(state.id), foundationDir: this.foundationDir,
      injectFailure: state.injectFailure, onEvent: async (type, data) => this.event(state, 'tools', type, data) });
  }
  async executeRole(state, id, workspace) {
    const role = ROLES.find(item => item.id === id);
    const context = {
      brief: state.brief, round: state.round, repairAttempt: id === 'builder' ? state.repairAttempt : 0,
      artifacts: Object.fromEntries(dependencies[id].filter(key => state.artifacts[key]).map(key => [key, state.artifacts[key]])),
      ...(id === 'builder' || id === 'verifier' ? { verification: state.verification } : {}),
    };
    const inputHash = digest(context);
    if (state.tasks[id]?.status === 'completed' && state.tasks[id].inputHash === inputHash) return state.artifacts[id];
    state.tasks[id] = { status: 'running', attempt: (state.tasks[id]?.attempt ?? 0) + 1, startedAt: new Date().toISOString(), inputHash };
    await this.event(state, id, 'agent_started', { inputHash, contextArtifacts: Object.keys(context.artifacts) });
    const allowed = workspace.definitions.filter(tool => role.tools.includes(tool.name));
    const submit = { type: 'function', name: 'submit_artifact', description: 'Submit your complete structured result for validation and handoff.', strict: true, parameters: artifactSchemas[id] };
    let submitted;
    let verificationForRole;
    const execute = async (name, args) => {
      try {
        if (name === 'submit_artifact') {
          validate(artifactSchemas[id], args);
          validateReferences(id, args, state.artifacts, { mode: state.mode, sources: state.sources[id] ?? [] });
          if (id === 'verifier') {
            if (!verificationForRole) throw new Error('Call run_checks in this verification task before submitting.');
            const passed = verificationForRole.ok;
            if ((args.verdict === 'pass') !== passed) throw new Error('Verdict contradicts the actual check results.');
            const actual = verificationForRole.checks;
            if (args.checks.length !== actual.length || args.checks.some(check => !actual.some(item => item.name === check.name && item.passed === check.passed))) {
              throw new Error('Report every actual check with its exact name and pass/fail result.');
            }
          }
          submitted = structuredClone(args);
          return { ok: true };
        }
        const tool = allowed.find(item => item.name === name);
        if (!tool) throw new Error(`Permission denied: ${id} cannot use ${name}.`);
        validate(tool.parameters, args);
        const result = await workspace.execute(name, args);
        if (name === 'generate_app') state.workspace = workspace.workspace;
        if (name === 'run_checks') {
          verificationForRole = result;
          state.verification = result;
          await this.store.save(state);
        }
        return result;
      } catch (error) {
        await this.event(state, id, 'tool_rejected', { name, error: error.message });
        return { ok: false, error: error.message };
      }
    };
    try {
      await this.provider({ mode: state.mode, role: id, context, schema: artifactSchemas[id],
        tools: [...allowed, submit], execute, budget: state.budget, model: this.model, apiKey: this.apiKey,
        onEvent: async (type, data) => {
          if (type === 'search') {
            const urls = (data.sources ?? []).map(item => typeof item === 'string' ? item : item.url).filter(Boolean);
            state.sources[id] = [...new Set([...(state.sources[id] ?? []), ...urls])];
          }
          await this.event(state, id, type, data);
        },
      });
      if (!submitted) throw new Error(`${id} ended without a validated artifact.`);
      state.artifacts[id] = submitted;
      state.tasks[id].status = 'completed';
      state.tasks[id].completedAt = new Date().toISOString();
      await this.event(state, id, 'artifact_committed', { hash: digest(submitted), artifact: submitted });
      return submitted;
    } catch (error) {
      state.tasks[id].status = 'failed';
      state.tasks[id].error = error.message;
      await this.event(state, id, 'agent_failed', { error: error.message });
      throw error;
    }
  }
  start(id) {
    if (this.active.has(id)) return this.active.get(id);
    const work = this.drive(id).finally(() => this.active.delete(id));
    this.active.set(id, work);
    return work;
  }
  async drive(id) {
    const release = await this.store.lock(id);
    try {
      const state = await this.get(id);
      this.states.set(id, state);
      if (['completed', 'awaiting_approval', 'paused'].includes(state.status)) return state;
      const workspace = await this.workspace(state);
      const agent = role => this.executeRole(state, role, workspace);
      const parallel = async roles => {
        const results = await Promise.allSettled(roles.map(agent));
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      };
      while (state.stage !== 'complete') {
        if (state.pauseRequested) {
          state.status = 'paused'; state.pauseRequested = false;
          await this.event(state, 'supervisor', 'run_paused', { stage: state.stage, note: 'Current tasks have reached a checkpoint.' });
          return state;
        }
        switch (state.stage) {
          case 'research': await parallel(['researcher', 'competitor']); state.stage = 'analyze'; break;
          case 'analyze': await agent('analyst'); state.stage = 'review'; break;
          case 'review': {
            const review = await agent('critic');
            if (review.verdict === 'revise') {
              if (state.round >= 1) throw new Error('Evidence remains insufficient after the bounded follow-up round. Review sources and start a revised brief.');
              state.round++;
              state.stage = 'research';
              await this.event(state, 'supervisor', 'research_follow_up', { queries: review.followUpQueries, round: state.round });
            } else state.stage = 'plan';
            break;
          }
          case 'plan':
            await agent('planner');
            state.specHash = digest(state.artifacts.planner);
            state.stage = 'approval';
            break;
          case 'approval':
            if (state.autoApprove) {
              state.approvedHash = state.specHash;
              await this.event(state, 'human', 'spec_approved', { hash: state.specHash, via: 'explicit CLI --auto-approve' });
            }
            if (state.approvedHash !== digest(state.artifacts.planner)) {
              state.status = 'awaiting_approval';
              await this.event(state, 'supervisor', 'approval_required', { specHash: state.specHash });
              return state;
            }
            state.stage = 'build'; break;
          case 'build':
            if (state.approvedHash !== digest(state.artifacts.planner)) throw new Error('Specification changed; approval is no longer valid.');
            await parallel(['builder', 'experimenter']); state.stage = 'verify'; break;
          case 'verify': {
            const verdict = await agent('verifier');
            if (verdict.verdict === 'fail') {
              if (state.repairAttempt >= 2) throw new Error('Verification failed after two repair attempts. Inspect the trace and generated source.');
              state.repairAttempt++;
              state.stage = 'build';
              await this.event(state, 'supervisor', 'repair_requested', { attempt: state.repairAttempt, verification: state.verification });
            } else state.stage = 'complete';
            break;
          }
          default: throw new Error(`Unknown workflow stage: ${state.stage}`);
        }
        await this.store.save(state);
      }
      state.status = 'completed';
      await this.event(state, 'supervisor', 'run_completed', { workspace: state.workspace, repairAttempts: state.repairAttempt,
        scope: 'Source typecheck and fixed foundation regression tests. Native behavior and product-market fit remain unverified.' });
      return state;
    } catch (error) {
      const state = await this.get(id);
      state.status = 'failed'; state.error = error.message;
      await this.event(state, 'supervisor', 'run_failed', { error: error.message });
      return state;
    } finally { await release(); }
  }
  async approve(id, specHash) {
    if (this.active.has(id)) throw new Error('Wait until the current task reaches its approval checkpoint.');
    const state = await this.get(id);
    if (state.status !== 'awaiting_approval') throw new Error('This run is not awaiting specification approval.');
    if (specHash !== state.specHash || specHash !== digest(state.artifacts.planner)) throw new Error('The specification changed. Refresh and review it before approving.');
    state.approvedHash = specHash; state.status = 'running';
    await this.event(state, 'human', 'spec_approved', { hash: specHash });
    return state;
  }
  async pause(id) {
    const state = await this.get(id);
    if (state.status !== 'running') throw new Error('Only a running workflow can be paused.');
    state.pauseRequested = true;
    await this.event(state, 'human', 'pause_requested', { note: 'Pause takes effect after the current task checkpoint.' });
    return state;
  }
  async resume(id) {
    if (this.active.has(id)) throw new Error('This run is already active.');
    const state = await this.get(id);
    if (state.status === 'completed' || state.status === 'awaiting_approval') throw new Error('Completed runs cannot resume; approval requires the specification hash.');
    state.status = 'running'; state.error = null; state.pauseRequested = false;
    this.states.set(id, state);
    await this.event(state, 'human', 'run_resumed', { stage: state.stage });
    return state;
  }
}
