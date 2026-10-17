import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RunStore } from './store.mjs';
import { ROLES, artifactSchemas } from '../agents/roles.mjs';
import { runAgent } from '../agents/provider.mjs';
import { createWorkspaceTools } from '../tools/workspace.mjs';
import { digest, validate, validateReferences } from './validation.mjs';
import { RESEARCH_ROLES } from '../agents/growth.mjs';
import { createIntegrationRegistry } from '../tools/mcp/client.mjs';
import { renderCreativePack, validateCreativePack } from '../outputs/creatives/render.mjs';
import { createLaunchArchive } from '../outputs/launch-pack.mjs';
import { SAMPLES } from '../samples.mjs';
import { loadCuratedResearch, CURATED_VERSION } from '../research/index.mjs';

const dependencies = {
  researcher: ['critic'], competitor: ['critic'], designer: ['critic'], ads_research: ['critic'],
  analyst: ['researcher', 'competitor', 'designer', 'ads_research'],
  persona: ['researcher', 'competitor', 'analyst', 'ads_research'],
  critic: ['researcher', 'competitor', 'analyst', 'persona', 'designer', 'ads_research'],
  planner: ['researcher', 'competitor', 'analyst', 'critic', 'persona', 'designer'],
  builder: ['planner', 'persona', 'designer'], verifier: ['planner', 'builder'],
  experimenter: ['planner', 'analyst', 'persona'],
  creative: ['planner', 'persona', 'designer', 'ads_research', 'creative_qa'],
  creative_qa: ['creative', 'persona', 'designer', 'ads_research'],
};

/** Deterministic supervisor: models own bounded tasks; code owns transitions and permissions. */
export class VentureStudio {
  constructor({ foundationDir, runsDir, provider = runAgent, workspaceFactory = createWorkspaceTools,
    creativeRenderer = renderCreativePack, creativeValidator = validateCreativePack, launchArchiver = createLaunchArchive, integrations,
    model = process.env.OPENAI_MODEL, apiKey = process.env.OPENAI_API_KEY } = {}) {
    this.foundationDir = path.resolve(foundationDir ?? path.join(import.meta.dirname, '../../..'));
    this.store = new RunStore(runsDir ?? path.join(this.foundationDir, '.agent-runs'));
    this.provider = provider;
    this.workspaceFactory = workspaceFactory;
    this.creativeRenderer = creativeRenderer;
    this.creativeValidator = creativeValidator;
    this.launchArchiver = launchArchiver;
    this.integrations = integrations ?? createIntegrationRegistry({ configPath: path.join(this.foundationDir, 'factory/agent/integrations.json') });
    this.integrationsReady = this.integrations.initialize().catch(error => { this.integrationError = error.message; });
    this.model = model;
    this.apiKey = apiKey;
    this.active = new Map();
    this.states = new Map();
  }
  get liveAvailable() { return Boolean(this.apiKey && this.model); }
  async integrationStatus() {
    await this.integrationsReady;
    return this.integrationError ? [{ id: 'configuration', status: 'error', error: this.integrationError }] : this.integrations.status();
  }
  async get(id) { return this.states.get(id) ?? this.store.read(id); }
  async event(state, role, type, data = {}) {
    // Trace user-visible tool activity, never credentials or hidden model reasoning.
    const safe = JSON.parse(JSON.stringify(this.integrations.redact?.(data) ?? data, (_key, value) => {
      if (typeof value !== 'string') return value;
      return this.apiKey ? value.replaceAll(this.apiKey, '[REDACTED]') : value;
    }));
    state.events.push({ id: state.events.length + 1, at: new Date().toISOString(), role, type, data: safe });
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
  }
  async create({ brief, mode = 'demo', injectFailure = false, autoApprove = false, sampleId } = {}) {
    const sample = sampleId ? SAMPLES.find(item => item.id === sampleId) : null;
    if (sampleId && !sample) throw new Error('Unknown curated sample.');
    if (sample && mode === 'live') throw new Error('Curated samples cannot be represented as live model research.');
    if (sample) { mode = 'curated'; brief ??= sample.brief; }
    if (typeof brief !== 'string' || brief.trim().length < 12 || brief.length > 6000) throw new Error('Enter a brief between 12 and 6,000 characters.');
    if (!['demo', 'live', 'curated'].includes(mode) || (mode === 'curated' && !sample)) throw new Error('Choose demo, live, or a named curated sample.');
    if (mode === 'live' && !this.liveAvailable) throw new Error('Live mode requires server-side OPENAI_API_KEY and OPENAI_MODEL.');
    if (mode === 'live' && injectFailure) throw new Error('Failure injection is available only in fixture demo mode.');
    const state = {
      id: randomUUID(), pipelineVersion: 2, brief: brief.trim(), mode, injectFailure: Boolean(injectFailure), autoApprove: Boolean(autoApprove),
      status: 'running', stage: 'research', round: 0, repairAttempt: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      artifacts: {}, tasks: {}, events: [], sources: {}, approvedHash: null, specHash: null,
      budget: { requests: 0, maxRequests: 64, toolCalls: 0, maxToolCalls: 160, maxOutputTokens: 9000, inputTokens: 0, outputTokens: 0 },
      workspace: null, verification: null, error: null, pauseRequested: false,
      creativePack: null, creativeVerification: null, creativeRepairAttempt: 0,
      ...(sample ? { sampleId: sample.id, sampleName: sample.name, curatedVersion: CURATED_VERSION } : {}),
    };
    if (sample) {
      const curated = await loadCuratedResearch();
      state.curatedResearch = curated.artifacts;
      state.sourceDetails = curated.sourceDetails;
      state.sources = curated.sources;
    }
    this.states.set(state.id, state);
    await this.event(state, 'supervisor', 'run_created', { mode, brief: state.brief, fixture: mode === 'demo' });
    if (sample) await this.event(state, 'curator', 'curated_sources_loaded', {
      evidenceRecords: Object.keys(state.sourceDetails).length,
      distinctSourceUrls: new Set(Object.values(state.sourceDetails).map(item => item.url)).size,
      note: 'Previously inspected public sources, not live model research. Product/persona/creative interpretations remain hypotheses.' });
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
      ...(id === 'creative' ? { creativeRepairAttempt: state.creativeRepairAttempt ?? 0 } : {}),
      ...(id === 'creative_qa' ? { creativeVerification: state.creativeVerification } : {}),
      ...(state.sampleId ? { sampleId: state.sampleId, curatedResearch: state.curatedResearch } : {}),
    };
    const inputHash = digest(context);
    if (state.tasks[id]?.status === 'completed' && state.tasks[id].inputHash === inputHash) return state.artifacts[id];
    state.tasks[id] = { status: 'running', attempt: (state.tasks[id]?.attempt ?? 0) + 1, startedAt: new Date().toISOString(), inputHash };
    await this.event(state, id, 'agent_started', { inputHash, contextArtifacts: Object.keys(context.artifacts) });
    await this.integrationsReady;
    const integrationTools = state.mode === 'live' && RESEARCH_ROLES.includes(id) ? await this.integrations.toolsForRole(id) : [];
    const qaTool = { type: 'function', name: 'inspect_creative_pack', description: 'Read actual creative file checks, dimensions and awareness coverage. This does not establish campaign performance or policy approval.', strict: true,
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } };
    const allowed = [...workspace.definitions, ...integrationTools, qaTool].filter(tool => role.tools.includes(tool.name));
    const submit = { type: 'function', name: 'submit_artifact', description: 'Submit your complete structured result for validation and handoff.', strict: true, parameters: artifactSchemas[id] };
    let submitted;
    let verificationForRole;
    let creativeChecksForRole;
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
          if (id === 'creative_qa') {
            if (!creativeChecksForRole) throw new Error('Call inspect_creative_pack in this task before submitting review.');
            if (args.verdict === 'pass' && !creativeChecksForRole.ok) throw new Error('Creative assets failed actual validation.');
            for (const actual of creativeChecksForRole.checks) {
              if (!args.checks.some(check => check.name === actual.name && check.passed === actual.passed)) throw new Error('Report every actual asset check accurately.');
            }
          }
          submitted = structuredClone(args);
          return { ok: true };
        }
        const tool = allowed.find(item => item.name === name);
        if (!tool) throw new Error(`Permission denied: ${id} cannot use ${name}.`);
        validate(tool.parameters, args);
        let result;
        if (name === 'query_research_source') {
          result = await this.integrations.execute(name, args, { role: id });
          state.sources[id] = [...new Set([...(state.sources[id] ?? []), ...(result.sources ?? [])])];
          await this.event(state, id, 'mcp_sources', { server: result.server, tool: result.tool, sources: result.sources });
        } else if (name === 'inspect_creative_pack') {
          if (!state.creativePack) throw new Error('Render the creative pack first.');
          result = await this.creativeValidator({ runDir: this.store.directory(state.id), creativePack: state.creativePack,
            creativeArtifact: state.artifacts.creative, personaArtifact: state.artifacts.persona });
          creativeChecksForRole = result;
          state.creativeVerification = result;
        } else result = await workspace.execute(name, args);
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
          case 'research': await parallel(RESEARCH_ROLES); state.stage = 'analyze'; break;
          case 'analyze': await agent('analyst'); state.stage = 'personas'; break;
          case 'personas': await agent('persona'); state.stage = 'review'; break;
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
              await this.event(state, 'human', 'spec_approved', { hash: state.specHash, via: state.sampleId ? 'explicit CLI sample seeding command' : 'explicit CLI --auto-approve' });
            }
            if (state.approvedHash !== digest(state.artifacts.planner)) {
              state.status = 'awaiting_approval';
              await this.event(state, 'supervisor', 'approval_required', { specHash: state.specHash });
              return state;
            }
            state.stage = 'build'; break;
          case 'build':
            if (state.approvedHash !== digest(state.artifacts.planner)) throw new Error('Specification changed; approval is no longer valid.');
            await parallel(['builder', 'experimenter', 'creative']); state.stage = 'render'; break;
          case 'render': {
            const creativeInputHash = digest({ creative: state.artifacts.creative, persona: state.artifacts.persona, spec: state.artifacts.planner });
            if (state.creativePack?.inputHash !== creativeInputHash) {
              await this.event(state, 'renderer', 'creative_render_started', { concepts: state.artifacts.creative.creatives.length });
              state.creativePack = await this.creativeRenderer({ runDir: this.store.directory(state.id), spec: state.artifacts.planner,
                personaArtifact: state.artifacts.persona, creativeArtifact: state.artifacts.creative, mode: state.mode,
                onEvent: event => this.event(state, 'renderer', event.type, event) });
              state.creativePack.inputHash = creativeInputHash;
            }
            state.creativeVerification = await this.creativeValidator({ runDir: this.store.directory(state.id), creativePack: state.creativePack,
              creativeArtifact: state.artifacts.creative, personaArtifact: state.artifacts.persona });
            Object.assign(state.creativePack, await this.launchArchiver({ runDir: this.store.directory(state.id), creativePack: state.creativePack, artifacts: state.artifacts, mode: state.mode, sourceDetails: state.sourceDetails }));
            await this.event(state, 'renderer', 'creative_pack_ready', { assets: state.creativePack.assets.length, ok: state.creativeVerification.ok });
            state.stage = 'verify'; break;
          }
          case 'verify': {
            await parallel(['verifier', 'creative_qa']);
            const verdict = state.artifacts.verifier;
            if (verdict.verdict === 'fail') {
              if (state.repairAttempt >= 2) throw new Error('Verification failed after two repair attempts. Inspect the trace and generated source.');
              state.repairAttempt++;
              state.stage = 'build';
              await this.event(state, 'supervisor', 'repair_requested', { attempt: state.repairAttempt, verification: state.verification });
            } else if (state.artifacts.creative_qa.verdict === 'fail') {
              if ((state.creativeRepairAttempt ?? 0) >= 2) throw new Error('Creative review failed after two revisions. Inspect the copy and asset report.');
              state.creativeRepairAttempt = (state.creativeRepairAttempt ?? 0) + 1;
              state.stage = 'build';
              await this.event(state, 'supervisor', 'creative_revision_requested', { attempt: state.creativeRepairAttempt });
            } else state.stage = 'complete';
            break;
          }
          default: throw new Error(`Unknown workflow stage: ${state.stage}`);
        }
        await this.store.save(state);
      }
      state.status = 'completed';
      await this.event(state, 'supervisor', 'run_completed', { workspace: state.workspace, repairAttempts: state.repairAttempt,
        creativeAssets: state.creativePack?.assets.length ?? 0,
        scope: 'Source typecheck, foundation regressions, and structural creative checks. Native behavior, Meta approval, ad performance and product-market fit remain unverified.' });
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
