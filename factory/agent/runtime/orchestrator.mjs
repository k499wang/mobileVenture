/**
 * The supervisor: the one place that decides what happens next in a run.
 *
 * A run moves through fixed stages:
 *
 *   research → analyze → personas → review → plan → approval → build → render → verify → complete
 *                                     │                 │                            │
 *                                     └─ one follow-up  └─ waits for a human         └─ up to two repairs
 *                                        research round    to approve the spec hash     (back to build)
 *
 * Models never choose the next stage. Each stage asks one or more agents for a structured
 * artifact, this file validates it, saves a checkpoint, and moves on. The rule is
 * "the model proposes, the code decides".
 *
 * Walkthrough order: `drive` (the stage machine), then `executeRole` (how a single agent
 * runs with only its own context and tools), then `approve` (approval bound to a hash).
 */
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
import { SAMPLES } from '../curated/samples.mjs';
import { loadCuratedResearch, CURATED_VERSION } from '../curated/research/index.mjs';

// Which earlier artifacts each role is allowed to see. An agent gets only these, not a
// shared chat history, so its context stays small and every input is traceable.
const dependencies = {
  researcher: ['critic'],
  competitor: ['critic'],
  designer: ['critic'],
  ads_research: ['critic'],
  analyst: ['researcher', 'competitor', 'designer', 'ads_research'],
  persona: ['researcher', 'competitor', 'analyst', 'ads_research'],
  critic: ['researcher', 'competitor', 'analyst', 'persona', 'designer', 'ads_research'],
  planner: ['researcher', 'competitor', 'analyst', 'critic', 'persona', 'designer'],
  builder: ['planner', 'persona', 'designer'],
  verifier: ['planner', 'builder'],
  experimenter: ['planner', 'analyst', 'persona'],
  creative: ['planner', 'persona', 'designer', 'ads_research', 'creative_qa'],
  creative_qa: ['creative', 'persona', 'designer', 'ads_research'],
};

/** Deterministic supervisor: models own bounded tasks; code owns transitions and permissions. */
export class VentureStudio {
  constructor({
    foundationDir,
    runsDir,
    provider = runAgent,
    workspaceFactory = createWorkspaceTools,
    creativeRenderer = renderCreativePack,
    creativeValidator = validateCreativePack,
    launchArchiver = createLaunchArchive,
    integrations,
    model = process.env.OPENAI_MODEL,
    apiKey = process.env.OPENAI_API_KEY,
  } = {}) {
    this.foundationDir = path.resolve(foundationDir ?? path.join(import.meta.dirname, '../../..'));
    this.store = new RunStore(runsDir ?? path.join(this.foundationDir, '.agent-runs'));
    this.provider = provider;
    this.workspaceFactory = workspaceFactory;
    this.creativeRenderer = creativeRenderer;
    this.creativeValidator = creativeValidator;
    this.launchArchiver = launchArchiver;
    this.integrations =
      integrations ??
      createIntegrationRegistry({
        configPath: path.join(this.foundationDir, 'factory/agent/integrations.json'),
      });
    this.integrationsReady = this.integrations.initialize().catch((error) => {
      this.integrationError = error.message;
    });
    this.model = model;
    this.apiKey = apiKey;
    this.active = new Map();
    this.states = new Map();
  }

  get liveAvailable() {
    return Boolean(this.apiKey && this.model);
  }

  async integrationStatus() {
    await this.integrationsReady;
    return this.integrationError
      ? [{ id: 'configuration', status: 'error', error: this.integrationError }]
      : this.integrations.status();
  }

  async get(id) {
    return this.states.get(id) ?? this.store.read(id);
  }

  /**
   * Append one entry to the run's trace and checkpoint the state. Every tool call, rejection,
   * approval and repair goes through here, which is what makes a run auditable afterwards.
   */
  async event(state, role, type, data = {}) {
    // Trace user-visible tool activity, never credentials or hidden model reasoning.
    const safe = JSON.parse(
      JSON.stringify(this.integrations.redact?.(data) ?? data, (_key, value) => {
        if (typeof value !== 'string') return value;
        return this.apiKey ? value.replaceAll(this.apiKey, '[REDACTED]') : value;
      }),
    );
    state.events.push({ id: state.events.length + 1, at: new Date().toISOString(), role, type, data: safe });
    state.updatedAt = new Date().toISOString();
    await this.store.save(state);
  }

  /**
   * Start a new run. Modes:
   *  - demo:    synthetic research, deterministic decisions; files and checks are real.
   *  - curated: real, previously inspected public sources (the showcase samples); no live model.
   *  - live:    real model calls and web search.
   */
  async create({ brief, mode = 'demo', injectFailure = false, autoApprove = false, sampleId } = {}) {
    const sample = sampleId ? SAMPLES.find((item) => item.id === sampleId) : null;
    if (sampleId && !sample) throw new Error('Unknown curated sample.');
    if (sample && mode === 'live')
      throw new Error('Curated samples cannot be represented as live model research.');
    if (sample) {
      mode = 'curated';
      brief ??= sample.brief;
    }
    if (typeof brief !== 'string' || brief.trim().length < 12 || brief.length > 6000)
      throw new Error('Enter a brief between 12 and 6,000 characters.');
    if (!['demo', 'live', 'curated'].includes(mode) || (mode === 'curated' && !sample))
      throw new Error('Choose demo, live, or a named curated sample.');
    if (mode === 'live' && !this.liveAvailable)
      throw new Error('Live mode requires server-side OPENAI_API_KEY and OPENAI_MODEL.');
    if (mode === 'live' && injectFailure)
      throw new Error('Failure injection is available only in fixture demo mode.');
    // The whole run lives in this one object, saved to .agent-runs/<id>/state.json after
    // every step. Resuming a run means reading this file back and continuing from `stage`.
    const state = {
      id: randomUUID(),
      pipelineVersion: 3,
      brief: brief.trim(),
      mode,
      injectFailure: Boolean(injectFailure),
      autoApprove: Boolean(autoApprove),
      status: 'running',
      stage: 'research',
      round: 0,
      repairAttempt: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifacts: {},
      tasks: {},
      events: [],
      sources: {},
      approvedHash: null,
      specHash: null,
      // One spending limit shared by every agent in the run, including agents running in parallel.
      budget: {
        requests: 0,
        maxRequests: 64,
        toolCalls: 0,
        maxToolCalls: 160,
        maxOutputTokens: 9000,
        inputTokens: 0,
        outputTokens: 0,
      },
      workspace: null,
      verification: null,
      error: null,
      pauseRequested: false,
      creativePack: null,
      creativeVerification: null,
      creativeRepairAttempt: 0,
      ...(sample ? { sampleId: sample.id, sampleName: sample.name, curatedVersion: CURATED_VERSION } : {}),
    };
    if (sample) {
      const curated = await loadCuratedResearch();
      state.curatedResearch = curated.artifacts;
      state.sourceDetails = curated.sourceDetails;
      state.sources = curated.sources;
    }
    this.states.set(state.id, state);
    await this.event(state, 'supervisor', 'run_created', {
      mode,
      brief: state.brief,
      fixture: mode === 'demo',
    });
    if (sample)
      await this.event(state, 'curator', 'curated_sources_loaded', {
        evidenceRecords: Object.keys(state.sourceDetails).length,
        distinctSourceUrls: new Set(Object.values(state.sourceDetails).map((item) => item.url)).size,
        note: 'Previously inspected public sources, not live model research. Product/persona/creative interpretations remain hypotheses.',
      });
    return state;
  }

  // The sandboxed file and check tools for this run (see tools/workspace.mjs).
  async workspace(state) {
    return this.workspaceFactory({
      runDir: this.store.directory(state.id),
      foundationDir: this.foundationDir,
      injectFailure: state.injectFailure,
      onEvent: async (type, data) => this.event(state, 'tools', type, data),
    });
  }

  /**
   * Run one agent to completion and return its validated artifact.
   *
   *  1. Build its context from only the artifacts it depends on.
   *  2. Skip it if it already finished with exactly this input (safe resume).
   *  3. Give it only the tools its role allows, plus `submit_artifact`.
   *  4. Let the model loop call tools (agents/provider.mjs). Every call comes through `execute`.
   *  5. Accept the result only through `submit_artifact`, after schema and evidence checks.
   */
  async executeRole(state, id, workspace) {
    const role = ROLES.find((item) => item.id === id);

    // 1. Context: the brief plus only this role's dependency artifacts.
    const context = {
      brief: state.brief,
      round: state.round,
      repairAttempt: id === 'builder' ? state.repairAttempt : 0,
      artifacts: Object.fromEntries(
        dependencies[id].filter((key) => state.artifacts[key]).map((key) => [key, state.artifacts[key]]),
      ),
      ...(id === 'builder' || id === 'verifier' ? { verification: state.verification } : {}),
      ...(id === 'creative' ? { creativeRepairAttempt: state.creativeRepairAttempt ?? 0 } : {}),
      ...(id === 'creative_qa' ? { creativeVerification: state.creativeVerification } : {}),
      ...(state.sampleId ? { sampleId: state.sampleId, curatedResearch: state.curatedResearch } : {}),
    };

    // 2. Resume safety: an agent that already completed with identical input is not re-run.
    //    A changed input (for example, new verification errors during repair) runs it again.
    const inputHash = digest(context);
    if (state.tasks[id]?.status === 'completed' && state.tasks[id].inputHash === inputHash)
      return state.artifacts[id];
    state.tasks[id] = {
      status: 'running',
      attempt: (state.tasks[id]?.attempt ?? 0) + 1,
      startedAt: new Date().toISOString(),
      inputHash,
    };
    await this.event(state, id, 'agent_started', {
      inputHash,
      contextArtifacts: Object.keys(context.artifacts),
    });

    // 3. Permissions: research roles may also get read-only MCP tools in live mode. Everything
    //    is then filtered down to the tool names listed for this role in agents/roles.mjs.
    await this.integrationsReady;
    const integrationTools =
      state.mode === 'live' && RESEARCH_ROLES.includes(id) ? await this.integrations.toolsForRole(id) : [];
    const qaTool = {
      type: 'function',
      name: 'inspect_creative_pack',
      description:
        'Read actual creative file checks, dimensions and awareness coverage. This does not establish campaign performance or policy approval.',
      strict: true,
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    };
    const allowed = [...workspace.definitions, ...integrationTools, qaTool].filter((tool) =>
      role.tools.includes(tool.name),
    );
    // The only way an agent can finish: submit an artifact matching its role's schema.
    const submit = {
      type: 'function',
      name: 'submit_artifact',
      description: 'Submit your complete structured result for validation and handoff.',
      strict: true,
      parameters: artifactSchemas[id],
    };
    let submitted;
    let verificationForRole;
    let creativeChecksForRole;

    // 4. Every tool call the model makes lands here. Errors are returned to the model as
    //    `{ ok: false, error }` so it can correct itself, and are recorded in the trace.
    const execute = async (name, args) => {
      try {
        if (name === 'submit_artifact') {
          // 5. The submission gate: schema shape, then evidence rules (cited IDs must exist,
          //    source URLs must have been actually retrieved, planner tests must cover criteria).
          validate(artifactSchemas[id], args);
          validateReferences(id, args, state.artifacts, {
            mode: state.mode,
            sources: state.sources[id] ?? [],
          });
          // The verifier cannot claim a result it did not observe: its verdict and every
          // check it reports must match the real run_checks output from this task.
          if (id === 'verifier') {
            if (!verificationForRole)
              throw new Error('Call run_checks in this verification task before submitting.');
            const passed = verificationForRole.ok;
            if ((args.verdict === 'pass') !== passed)
              throw new Error('Verdict contradicts the actual check results.');
            const actual = verificationForRole.checks;
            if (
              args.checks.length !== actual.length ||
              args.checks.some(
                (check) => !actual.some((item) => item.name === check.name && item.passed === check.passed),
              )
            ) {
              throw new Error('Report every actual check with its exact name and pass/fail result.');
            }
          }
          if (id === 'creative_qa') {
            if (!creativeChecksForRole)
              throw new Error('Call inspect_creative_pack in this task before submitting review.');
            if (args.verdict === 'pass' && !creativeChecksForRole.ok)
              throw new Error('Creative assets failed actual validation.');
            for (const actual of creativeChecksForRole.checks) {
              if (!args.checks.some((check) => check.name === actual.name && check.passed === actual.passed))
                throw new Error('Report every actual asset check accurately.');
            }
          }
          submitted = structuredClone(args);
          return { ok: true };
        }

        // Any other tool: must be on this role's allowlist and match its argument schema.
        const tool = allowed.find((item) => item.name === name);
        if (!tool) throw new Error(`Permission denied: ${id} cannot use ${name}.`);
        validate(tool.parameters, args);
        let result;
        if (name === 'query_research_source') {
          // MCP research: record every URL the server really returned, for the evidence gate.
          result = await this.integrations.execute(name, args, { role: id });
          state.sources[id] = [...new Set([...(state.sources[id] ?? []), ...(result.sources ?? [])])];
          await this.event(state, id, 'mcp_sources', {
            server: result.server,
            tool: result.tool,
            sources: result.sources,
          });
        } else if (name === 'inspect_creative_pack') {
          if (!state.creativePack) throw new Error('Render the creative pack first.');
          result = await this.creativeValidator({
            runDir: this.store.directory(state.id),
            creativePack: state.creativePack,
            creativeArtifact: state.artifacts.creative,
            personaArtifact: state.artifacts.persona,
          });
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

    // Run the model loop. Web-search URLs are recorded as they arrive, so evidence can
    // later be checked against what was actually retrieved.
    try {
      await this.provider({
        mode: state.mode,
        role: id,
        context,
        schema: artifactSchemas[id],
        tools: [...allowed, submit],
        execute,
        budget: state.budget,
        model: this.model,
        apiKey: this.apiKey,
        onEvent: async (type, data) => {
          if (type === 'search') {
            const urls = (data.sources ?? [])
              .map((item) => (typeof item === 'string' ? item : item.url))
              .filter(Boolean);
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

  // Begin (or rejoin) driving a run in the background. Only one driver per run at a time.
  start(id) {
    if (this.active.has(id)) return this.active.get(id);
    const work = this.drive(id).finally(() => this.active.delete(id));
    this.active.set(id, work);
    return work;
  }

  /**
   * The stage machine. Runs stages in order until the run completes, pauses, needs human
   * approval, or fails. A checkpoint is saved after every stage, so a crashed or paused run
   * continues from its last saved stage.
   */
  async drive(id) {
    // A lock file stops two processes from driving the same run at once.
    const release = await this.store.lock(id);
    try {
      const state = await this.get(id);
      this.states.set(id, state);
      if (['completed', 'awaiting_approval', 'paused'].includes(state.status)) return state;
      const workspace = await this.workspace(state);
      const agent = (role) => this.executeRole(state, role, workspace);
      // Run several agents at once; if any fails, the stage fails.
      const parallel = async (roles) => {
        const results = await Promise.allSettled(roles.map(agent));
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
      };
      while (state.stage !== 'complete') {
        if (state.pauseRequested) {
          state.status = 'paused';
          state.pauseRequested = false;
          await this.event(state, 'supervisor', 'run_paused', {
            stage: state.stage,
            note: 'Current tasks have reached a checkpoint.',
          });
          return state;
        }
        switch (state.stage) {
          // Market, competitor, design and ad research run in parallel.
          case 'research':
            await parallel(RESEARCH_ROLES);
            state.stage = 'analyze';
            break;
          case 'analyze':
            await agent('analyst');
            state.stage = 'personas';
            break;
          case 'personas':
            await agent('persona');
            state.stage = 'review';
            break;
          // The skeptical reviewer can send research back once. A second rejection stops the
          // run instead of looping, so weak evidence fails visibly.
          case 'review': {
            const review = await agent('critic');
            if (review.verdict === 'revise') {
              if (state.round >= 1)
                throw new Error(
                  'Evidence remains insufficient after the bounded follow-up round. Review sources and start a revised brief.',
                );
              state.round++;
              state.stage = 'research';
              await this.event(state, 'supervisor', 'research_follow_up', {
                queries: review.followUpQueries,
                round: state.round,
              });
            } else state.stage = 'plan';
            break;
          }
          // The planner writes the spec, including acceptance tests written before any code exists.
          // Its SHA-256 hash is what the human approves.
          case 'plan':
            await agent('planner');
            state.specHash = digest(state.artifacts.planner);
            state.stage = 'approval';
            break;
          // Human checkpoint. The run stops here until `approve` records the matching hash.
          case 'approval':
            if (state.autoApprove) {
              state.approvedHash = state.specHash;
              await this.event(state, 'human', 'spec_approved', {
                hash: state.specHash,
                via: state.sampleId ? 'explicit CLI sample seeding command' : 'explicit CLI --auto-approve',
              });
            }
            if (state.approvedHash !== digest(state.artifacts.planner)) {
              state.status = 'awaiting_approval';
              await this.event(state, 'supervisor', 'approval_required', { specHash: state.specHash });
              return state;
            }
            state.stage = 'build';
            break;
          // Re-check the hash before building: an approval never carries over to a changed spec.
          // The approved acceptance tests are handed to the workspace, where the builder can read
          // them but not edit them.
          case 'build':
            if (state.approvedHash !== digest(state.artifacts.planner))
              throw new Error('Specification changed; approval is no longer valid.');
            if (!state.artifacts.planner.acceptanceTests)
              throw new Error('This run predates planner acceptance tests. Start a new run.');
            workspace.setAcceptanceTests(state.artifacts.planner.acceptanceTests.source);
            await parallel(['builder', 'experimenter', 'creative']);
            state.stage = 'render';
            break;
          // Render ad creatives and the launch ZIP. Skipped on resume if their inputs are unchanged.
          case 'render': {
            const creativeInputHash = digest({
              creative: state.artifacts.creative,
              persona: state.artifacts.persona,
              spec: state.artifacts.planner,
            });
            if (state.creativePack?.inputHash !== creativeInputHash) {
              await this.event(state, 'renderer', 'creative_render_started', {
                concepts: state.artifacts.creative.creatives.length,
              });
              state.creativePack = await this.creativeRenderer({
                runDir: this.store.directory(state.id),
                spec: state.artifacts.planner,
                personaArtifact: state.artifacts.persona,
                creativeArtifact: state.artifacts.creative,
                mode: state.mode,
                onEvent: (event) => this.event(state, 'renderer', event.type, event),
              });
              state.creativePack.inputHash = creativeInputHash;
            }
            state.creativeVerification = await this.creativeValidator({
              runDir: this.store.directory(state.id),
              creativePack: state.creativePack,
              creativeArtifact: state.artifacts.creative,
              personaArtifact: state.artifacts.persona,
            });
            Object.assign(
              state.creativePack,
              await this.launchArchiver({
                runDir: this.store.directory(state.id),
                creativePack: state.creativePack,
                artifacts: state.artifacts,
                mode: state.mode,
                sourceDetails: state.sourceDetails,
              }),
            );
            await this.event(state, 'renderer', 'creative_pack_ready', {
              assets: state.creativePack.assets.length,
              ok: state.creativeVerification.ok,
            });
            state.stage = 'verify';
            break;
          }
          // Real checks: typecheck, foundation regression tests and the planner's acceptance tests.
          // A failure sends the builder back with the actual errors, at most twice.
          case 'verify': {
            workspace.setAcceptanceTests(state.artifacts.planner.acceptanceTests.source);
            await parallel(['verifier', 'creative_qa']);
            const verdict = state.artifacts.verifier;
            if (verdict.verdict === 'fail') {
              if (state.repairAttempt >= 2)
                throw new Error(
                  'Verification failed after two repair attempts. Inspect the trace and generated source.',
                );
              state.repairAttempt++;
              state.stage = 'build';
              await this.event(state, 'supervisor', 'repair_requested', {
                attempt: state.repairAttempt,
                verification: state.verification,
              });
            } else if (state.artifacts.creative_qa.verdict === 'fail') {
              if ((state.creativeRepairAttempt ?? 0) >= 2)
                throw new Error(
                  'Creative review failed after two revisions. Inspect the copy and asset report.',
                );
              state.creativeRepairAttempt = (state.creativeRepairAttempt ?? 0) + 1;
              state.stage = 'build';
              await this.event(state, 'supervisor', 'creative_revision_requested', {
                attempt: state.creativeRepairAttempt,
              });
            } else state.stage = 'complete';
            break;
          }
          default:
            throw new Error(`Unknown workflow stage: ${state.stage}`);
        }
        // Checkpoint after every stage.
        await this.store.save(state);
      }
      state.status = 'completed';
      await this.event(state, 'supervisor', 'run_completed', {
        workspace: state.workspace,
        repairAttempts: state.repairAttempt,
        creativeAssets: state.creativePack?.assets.length ?? 0,
        scope:
          'Source typecheck, foundation regressions, and structural creative checks. Native behavior, Meta approval, ad performance and product-market fit remain unverified.',
      });
      return state;
    } catch (error) {
      const state = await this.get(id);
      state.status = 'failed';
      state.error = error.message;
      await this.event(state, 'supervisor', 'run_failed', { error: error.message });
      return state;
    } finally {
      await release();
    }
  }

  /**
   * Human approval. The caller must send the hash of the spec they reviewed. If the spec has
   * changed since, the hashes differ and approval is refused: you can only approve what you saw.
   */
  async approve(id, specHash) {
    if (this.active.has(id)) throw new Error('Wait until the current task reaches its approval checkpoint.');
    const state = await this.get(id);
    if (state.status !== 'awaiting_approval')
      throw new Error('This run is not awaiting specification approval.');
    if (specHash !== state.specHash || specHash !== digest(state.artifacts.planner))
      throw new Error('The specification changed. Refresh and review it before approving.');
    state.approvedHash = specHash;
    state.status = 'running';
    await this.event(state, 'human', 'spec_approved', { hash: specHash });
    return state;
  }

  // Pausing takes effect at the next stage boundary, after the current checkpoint.
  async pause(id) {
    const state = await this.get(id);
    if (state.status !== 'running') throw new Error('Only a running workflow can be paused.');
    state.pauseRequested = true;
    await this.event(state, 'human', 'pause_requested', {
      note: 'Pause takes effect after the current task checkpoint.',
    });
    return state;
  }

  async resume(id) {
    if (this.active.has(id)) throw new Error('This run is already active.');
    const state = await this.get(id);
    if (state.status === 'completed' || state.status === 'awaiting_approval')
      throw new Error('Completed runs cannot resume; approval requires the specification hash.');
    state.status = 'running';
    state.error = null;
    state.pauseRequested = false;
    this.states.set(id, state);
    await this.event(state, 'human', 'run_resumed', { stage: state.stage });
    return state;
  }
}
