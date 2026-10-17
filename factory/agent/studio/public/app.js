const $ = (selector) => document.querySelector(selector);
const fallbackRoles = [
  { id: 'researcher', name: 'Market researcher', description: 'Collect sources and customer signals.', color: '#a3bde5', tools: ['search', 'read'] },
  { id: 'competitor', name: 'Competitor analyst', description: 'Map alternatives and positioning.', color: '#c5b0e9', tools: ['search', 'read'] },
  { id: 'analyst', name: 'Opportunity analyst', description: 'Connect evidence to product opportunities.', color: '#e7bc87', tools: ['evidence'] },
  { id: 'critic', name: 'Skeptical reviewer', description: 'Challenge assumptions and weak sources.', color: '#df9da2', tools: ['evidence'] },
  { id: 'planner', name: 'Product planner', description: 'Turn an opportunity into a bounded spec.', color: '#9bc7ba', tools: ['specification'] },
  { id: 'builder', name: 'App builder', description: 'Generate a prototype in an isolated workspace.', color: '#a8cf9a', tools: ['factory', 'files'] },
  { id: 'verifier', name: 'Verification agent', description: 'Run checks and request targeted repairs.', color: '#a6bcdf', tools: ['checks'] },
  { id: 'experimenter', name: 'Experiment planner', description: 'Define metrics for the product hypothesis.', color: '#d3b293', tools: ['experiments'] },
];
fallbackRoles.push(
  { id: 'designer', name: 'Design researcher', description: 'Adapt referenced patterns into a design direction.', color: '#b9a9e1', tools: ['design_research'] },
  { id: 'ads_research', name: 'Ad researcher', description: 'Inspect public messaging and creative angles.', color: '#cbb58c', tools: ['ad_research'] },
  { id: 'persona', name: 'Persona strategist', description: 'Map jobs, objections, and awareness stages.', color: '#91c7c8', tools: ['evidence'] },
  { id: 'creative', name: 'Creative strategist', description: 'Write persona-aware static ad concepts.', color: '#e0a1bc', tools: ['creative'] },
  { id: 'creative_qa', name: 'Creative reviewer', description: 'Check coverage, claims, and rendered assets.', color: '#9fc4aa', tools: ['checks'] },
);
const state = { config: { liveAvailable: false, roles: fallbackRoles }, runs: [], run: null, tab: 'overview', busy: false, polling: false, files: [], selectedFile: null, fileContent: '', fileRun: null, personaFilter: '', stageFilter: '', evidenceFilter: '', openedEvents: new Set(), error: null };
const statusNames = { running: 'Running', paused: 'Paused', awaiting_approval: 'Awaiting approval', completed: 'Completed', failed: 'Failed' };
const roleNames = () => Object.fromEntries(state.config.roles.map((role) => [role.id, role.name]));
const list = (value) => Array.isArray(value) ? value : [];
const str = (value) => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
const humanize = (value) => str(value).replaceAll('_', ' ').replaceAll('-', ' ');
const formatNumber = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '0';
const shortTime = (value) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const shortDate = (value) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : str(value));
  }
  for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(str(child)));
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error(`The local server returned an unreadable response (${response.status}).`); }
  if (!response.ok) throw new Error(data.error?.message || str(data.error) || `Request failed (${response.status}).`);
  return data;
}

function showError(error) {
  state.error = error ? str(error.message || error) : null;
  $('#error-banner').hidden = !state.error;
  $('#error-banner').textContent = state.error || '';
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  setTimeout(() => { $('#toast').hidden = true; }, 3800);
}

function jsonDetails(value, label = 'Inspect structured artifact') {
  return el('details', { class: 'json-details' }, el('summary', {}, label), el('pre', { class: 'json-view' }, JSON.stringify(value, null, 2)));
}

function card(title, ...children) { return el('article', { class: 'content-card' }, title ? el('h3', {}, title) : null, ...children); }
function textParagraph(value) { return value ? el('p', {}, str(value)) : null; }
function bulletList(items) { return list(items).length ? el('ul', {}, list(items).map((item) => el('li', {}, str(item)))) : null; }
function tags(items) { return list(items).length ? el('div', { class: 'tag-row' }, list(items).map((item) => el('span', { class: 'tag' }, str(item)))) : null; }
function evidenceTags(items) {
  return list(items).length ? el('div', { class: 'tag-row' }, list(items).map((id) => el('button', { class: 'tag', 'aria-label': `Inspect supporting evidence ${id}`, onclick: () => {
    state.evidenceFilter = '';
    setTab('evidence');
    const source = document.getElementById(`evidence-${id}`);
    if (source) { source.tabIndex = -1; source.focus({ preventScroll: true }); source.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  } }, str(id), ' ↗'))) : null;
}
function empty(title, description, symbol = '↗') { return el('div', { class: 'empty-state' }, el('div', { class: 'empty-symbol', 'aria-hidden': 'true' }, symbol), el('h3', {}, title), el('p', {}, description)); }

function setTab(tab, moveFocus = false) {
  state.tab = tab;
  document.querySelectorAll('[role="tab"]').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) button.focus();
  });
  $('#detail-panel').setAttribute('aria-labelledby', `tab-${tab}`);
  renderDetail();
  if (tab === 'code' && state.run) loadFiles();
  if (tab === 'connections') refreshConnections();
}

function renderHistory() {
  $('#run-count').textContent = String(state.runs.length);
  if (!state.runs.length) { $('#run-list').replaceChildren(el('p', { class: 'sidebar-empty' }, 'Your investigations will appear here.')); return; }
  $('#run-list').replaceChildren(...state.runs.map((run) => el('button', { class: `history-item${run.id === state.run?.id ? ' selected' : ''}`, onclick: () => selectRun(run.id), 'aria-current': run.id === state.run?.id ? 'true' : null },
    el('span', { class: 'history-title', title: run.brief || '' }, run.sampleName || run.brief || run.id),
    el('span', { class: 'history-meta' }, el('span', { class: `history-dot ${run.status}` }), humanize(run.status), ' · ', shortDate(run.createdAt), run.sampleId ? ' · sample' : run.mode === 'demo' ? ' · fixture' : ' · live')
  )));
}

function renderMode() {
  const mode = state.run?.mode || $('#run-mode').value;
  const live = mode === 'live';
  const sample = Boolean(state.run?.sampleId);
  $('#mode-notice').classList.toggle('live', live);
  $('#mode-notice strong').textContent = sample ? 'Curated research sample' : live ? 'Live agent execution' : 'Replayable demo environment';
  $('#mode-notice div > span').textContent = sample ? 'Research sources are curated and inspectable. Personas, product decisions, and original ad concepts are hypotheses for review.' : live ? 'Model-backed agents use real tools. Findings remain hypotheses until reviewed; inspect the sources and limitations.' : 'Uses labeled fixtures to exercise the workflow. Research is illustrative, not live market evidence.';
  $('#mode-notice .notice-tag').textContent = sample ? 'CURATED SOURCES' : live ? (state.config.model || 'LIVE MODEL') : 'NO API KEY NEEDED';
  $('#live-help').textContent = $('#run-mode').value === 'live' ? `Live mode uses ${state.config.model || 'the configured model'} and consumes API usage within the run budget.` : 'Demo mode uses deterministic fixtures. No external model calls.';
}

function taskStatus(role) {
  const task = state.run?.tasks?.[role.id];
  if (!task) return { label: 'Waiting', icon: '○', className: '', attempt: '' };
  if (['completed', 'passed', 'done'].includes(task.status)) return { label: 'Complete', icon: '✓', className: 'done', attempt: task.attempt > 1 ? `attempt ${task.attempt}` : '' };
  if (['running', 'in_progress'].includes(task.status)) return { label: 'Working', icon: '●', className: 'active', attempt: task.attempt > 1 ? `attempt ${task.attempt}` : '' };
  if (['failed', 'error'].includes(task.status)) return { label: 'Failed', icon: '!', className: 'error', attempt: `attempt ${task.attempt || 1}` };
  return { label: humanize(task.status || 'waiting'), icon: '○', className: '', attempt: '' };
}

function renderPipeline() {
  $('#agent-count').textContent = String(state.config.roles.length);
  $('#pipeline').replaceChildren(...state.config.roles.map((role, index) => {
    const status = taskStatus(role);
    const node = el('article', { class: `agent-card ${status.className}`, 'aria-label': `${role.name}: ${status.label}`, title: list(role.tools).length ? `Tools: ${role.tools.join(', ')}` : 'Reasoning role: no external tools' },
      el('div', { class: 'agent-card-top' }, el('span', { class: 'agent-avatar' }, String(index + 1).padStart(2, '0')), el('h3', {}, role.name), el('span', { class: 'agent-state-icon', 'aria-hidden': 'true' }, status.icon)),
      el('p', {}, role.description), el('div', { class: 'agent-card-bottom' }, el('span', {}, status.label.toUpperCase()), el('span', {}, status.attempt || `${list(role.tools).length} tools`)));
    if (/^#[a-f\d]{3,8}$/i.test(role.color || '')) node.style.setProperty('--agent-color', role.color);
    return node;
  }));
  $('#run-status').className = `status-pill ${state.run?.status || ''}`;
  $('#run-status').textContent = statusNames[state.run?.status] || 'Ready';
}

function renderBudget() {
  const budget = state.run?.budget || {};
  const progress = (label, used, maximum) => {
    const fill = el('div', { class: 'progress-fill' });
    const limit = Number(maximum) || 0;
    fill.style.width = `${Math.min(100, Math.max(0, limit ? Number(used || 0) / limit * 100 : 0))}%`;
    return el('div', { class: 'budget-row' }, el('div', { class: 'budget-label' }, label, el('strong', {}, `${formatNumber(used)} / ${limit || '—'}`)), el('div', { class: 'progress-track', role: 'progressbar', 'aria-label': label, 'aria-valuenow': Number(used) || 0, 'aria-valuemin': 0, 'aria-valuemax': limit || 1 }, fill));
  };
  $('#budget').replaceChildren(...[progress('Model requests', budget.requests, budget.maxRequests), progress('Tool calls', budget.toolCalls, budget.maxToolCalls),
    el('div', { class: 'budget-tokens' }, el('span', {}, 'INPUT ', el('strong', {}, formatNumber(budget.inputTokens))), el('span', {}, 'OUTPUT ', el('strong', {}, formatNumber(budget.outputTokens)))),
    ['demo', 'curated'].includes(state.run?.mode) ? el('p', { class: 'artifact-meta' }, state.run?.mode === 'curated' ? 'Curated source snapshot · no model tokens used.' : 'Fixture run · no model tokens used.') : null].filter(Boolean));
}

async function action(name, body = {}) {
  if (!state.run || state.busy) return;
  state.busy = true;
  renderActions();
  try {
    const run = await api(`/api/runs/${encodeURIComponent(state.run.id)}/${name}`, { method: 'POST', body: JSON.stringify(body) });
    updateRun(run);
    showError(null);
    toast(name === 'approve' ? 'Specification approved. The build can proceed.' : name === 'pause' ? 'Pause requested. The current tool may finish first.' : 'Execution resumed from its checkpoint.');
  } catch (error) { showError(error); }
  finally { state.busy = false; renderActions(); if (state.tab === 'specification') renderDetail(); }
}

function renderActions() {
  const run = state.run;
  const actions = [];
  if (run?.status === 'running') actions.push(el('button', { class: 'small-button', disabled: state.busy, onclick: () => action('pause') }, 'Ⅱ Pause'));
  if (run?.status === 'paused') actions.push(el('button', { class: 'small-button', disabled: state.busy, onclick: () => action('resume') }, '▷ Resume'));
  if (run) actions.push(el('a', { class: 'small-button', href: `/api/runs/${encodeURIComponent(run.id)}/export`, download: `${run.id}.json`, style: 'text-decoration:none', 'aria-label': 'Download complete run trace as JSON' }, '↓ Export'));
  $('#run-actions').replaceChildren(...actions);
}

function renderOverview() {
  const run = state.run;
  if (!run) return empty('Your next idea starts here.', 'Give the team a market question. Follow the evidence, review the specification, and watch a prototype take shape.');
  const artifacts = run.artifacts || {};
  const nodes = [];
  nodes.push(card(null, el('div', { class: 'card-label' }, 'MISSION / ', run.sampleId ? 'CURATED SAMPLE' : run.mode === 'demo' ? 'FIXTURE DEMO' : 'LIVE RUN'), el('h3', {}, run.brief),
    el('div', { class: 'summary-strip' }, ...[['Stage', humanize(run.stage || run.status)], ['Started', shortTime(run.createdAt)], ['Artifacts', `${Object.keys(artifacts).filter((key) => artifacts[key]).length} / ${state.config.roles.length}`]].map(([label, value]) => el('div', { class: 'summary-item' }, label, el('strong', {}, value)))),
    run.workspace ? el('p', { class: 'artifact-meta' }, 'Workspace: ', run.workspace) : null,
    run.status === 'awaiting_approval' ? el('button', { class: 'primary', onclick: () => setTab('specification') }, 'Review product specification →') : null,
    run.status === 'paused' ? textParagraph('Execution is paused at a checkpoint. Resume to continue from saved context.') : null,
    run.error ? el('p', {}, 'Execution issue: ', str(run.error)) : null));
  if (artifacts.creative) nodes.push(card('Your launch creative pack', textParagraph(artifacts.creative.summary), tags([`${list(artifacts.persona?.personas).length} personas`, `${list(artifacts.creative.creatives).length} creative concepts`, `${list(run.creativePack?.assets).length} rendered assets`]), el('button', { class: 'primary', onclick: () => setTab('creatives') }, 'Explore persona × awareness creatives →'), textParagraph('Concepts for human review. No ads are published and no performance results are implied.')));
  if (artifacts.verifier) nodes.push(renderVerification(artifacts.verifier));
  if (artifacts.critic) nodes.push(card('The skeptical review', el('div', { class: 'card-label' }, humanize(artifacts.critic.verdict || 'review')), textParagraph(artifacts.critic.summary), bulletList(artifacts.critic.issues), list(artifacts.critic.followUpQueries).length ? el('h4', {}, 'Requested follow-up research') : null, bulletList(artifacts.critic.followUpQueries)));
  if (artifacts.analyst) {
    nodes.push(card('Opportunity shortlist', ...list(artifacts.analyst.opportunities).map((opportunity) => el('div', {}, el('h4', {}, opportunity.title, opportunity.score != null ? ` · score ${opportunity.score}` : ''), textParagraph(opportunity.rationale), evidenceTags(opportunity.evidenceIds), bulletList(opportunity.assumptions))), jsonDetails(artifacts.analyst)));
  }
  if (artifacts.builder) nodes.push(card('Prototype handoff', textParagraph(artifacts.builder.summary), tags(artifacts.builder.files), bulletList(artifacts.builder.limitations), el('button', { class: 'small-button', onclick: () => setTab('code') }, 'Inspect generated files →')));
  if (artifacts.experimenter) nodes.push(renderExperiments(artifacts.experimenter));
  if (nodes.length === 1) nodes.push(empty('The investigation is underway.', 'Agent outputs will appear as tasks finish. Open Trace to inspect tool calls and execution events.', '◎'));
  return nodes;
}

function renderVerification(artifact) {
  return card('Verification report', el('div', { class: 'card-label' }, humanize(artifact.verdict || 'verification')), textParagraph(artifact.summary), ...list(artifact.checks).map((check) => el('p', {}, check.passed ? '✓ ' : '✕ ', el('strong', {}, check.name), ' — ', check.detail)), jsonDetails(artifact));
}

function renderExperiments(artifact) {
  return card('What would we measure?', textParagraph(artifact.summary), ...list(artifact.experiments).map((experiment) => el('div', {}, el('h4', {}, experiment.hypothesis || experiment.id), textParagraph(experiment.metric ? `Metric: ${experiment.metric}` : null), textParagraph(experiment.successCriterion ? `Success criterion: ${experiment.successCriterion}` : null), tags(experiment.events), bulletList(experiment.limitations))), jsonDetails(artifact));
}

function safeLink(url, title) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return el('span', { class: 'artifact-meta' }, 'Source URL unavailable');
    return el('a', { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' }, title || parsed.hostname, ' ↗');
  } catch { return el('span', { class: 'artifact-meta' }, 'Source URL unavailable'); }
}

function evidenceCategory(evidence) {
  const descriptor = `${evidence.sourceType || ''} ${evidence.url || ''}`.toLowerCase();
  if (/reddit/.test(descriptor)) return 'reddit';
  if (/app.store|apps.apple|itunes|storefront/.test(descriptor)) return 'app_store';
  if (/design|screensdesign/.test(descriptor)) return 'design';
  if (/advert|ad.library|facebook|adspy|foreplay|adheart|meta|creative/.test(descriptor)) return 'ads';
  return 'official';
}
function renderEvidence() {
  const run = state.run;
  const artifacts = run?.artifacts || {};
  const records = ['researcher', 'competitor', 'designer', 'ads_research'].flatMap((role) => list(artifacts[role]?.evidence || artifacts[role]?.sources));
  if (!records.length) return empty('Sources come before conclusions.', 'Research and competitor evidence will appear here with source links, retrieval dates, and explicit fixture labels.', '⌕');
  const uniqueURLs = new Set(records.map((record) => record.url).filter(Boolean));
  const options = [['', 'All sources'], ['reddit', 'Reddit'], ['app_store', 'App Store'], ['design', 'Design'], ['ads', 'Ads'], ['official', 'Official / other']];
  const nodes = [card('Research provenance', textParagraph(`${records.length} evidence themes across ${uniqueURLs.size} distinct source URLs. Several themes can come from one source; themes are not independent participants.`),
    el('label', { class: 'creative-filter' }, 'Source type', el('select', { onchange: (event) => { state.evidenceFilter = event.target.value; renderDetail(); } }, ...options.map(([value, label]) => el('option', { value, selected: state.evidenceFilter === value }, label)))),
    textParagraph(run?.sampleId ? 'Curated source snapshots support interpretation, not representative market validation. Persona and product decisions remain hypotheses.' : null))];
  for (const role of ['researcher', 'competitor', 'designer', 'ads_research']) {
    const artifact = artifacts[role];
    if (!artifact) continue;
    const matching = list(artifact.evidence || artifact.sources).filter((record) => !state.evidenceFilter || evidenceCategory(record) === state.evidenceFilter);
    if (!matching.length) continue;
    nodes.push(card(roleNames()[role] || humanize(role), textParagraph(artifact.summary), bulletList(artifact.limitations), artifact.competitors ? list(artifact.competitors).map((competitor) => el('div', {}, el('h4', {}, competitor.name), textParagraph(competitor.positioning), textParagraph(competitor.pricing), evidenceTags(competitor.evidenceIds))) : null));
    for (const evidence of matching) {
      const detail = run?.sourceDetails?.[evidence.id] || {};
      const locator = typeof detail.locator === 'object' && detail.locator !== null ? Object.entries(detail.locator).map(([key, value]) => `${humanize(key)}: ${str(value)}`).join(' · ') : detail.locator;
      const source = card(null, el('div', { class: 'card-label' }, evidence.id || 'SOURCE', evidence.fixture ? el('span', { class: 'status-pill' }, 'FIXTURE') : el('span', { class: 'status-pill' }, run?.sampleId ? 'CURATED SOURCE' : 'SOURCE'), humanize(evidenceCategory(evidence))),
        safeLink(evidence.url, evidence.title), detail.app ? el('h4', {}, detail.app) : null,
        detail.quote ? el('blockquote', { class: 'source-quotation' }, str(detail.quote)) : null,
        locator ? textParagraph(locator) : null,
        evidence.claim ? el('p', { class: 'evidence-quote' }, evidence.claim) : null,
        el('div', { class: 'artifact-meta' }, [evidence.sourceType, detail.publishedAt ? `Published ${shortDate(detail.publishedAt)}` : '', evidence.retrievedAt ? `Retrieved ${shortDate(evidence.retrievedAt)}` : ''].filter(Boolean).join(' · ')),
        detail.ad ? card('Original ad source reference', textParagraph(detail.ad.verification), detail.ad.previewFilename ? el('a', { href: `/api/research/previews/${encodeURIComponent(detail.ad.previewFilename)}`, target: '_blank', rel: 'noopener noreferrer' }, 'View locally saved original creative reference ↗') : null, detail.ad.previewUrl ? safeLink(detail.ad.previewUrl, 'View original creative reference') : null, textParagraph('This reference is separate from the original draft creatives generated by this project.')) : null,
        bulletList(detail.limitations), jsonDetails({ ...evidence, sourceDetails: detail }, 'Inspect evidence record'));
      source.id = `evidence-${evidence.id}`;
      nodes.push(source);
    }
  }
  return nodes;
}

function renderSpecification() {
  const run = state.run;
  const spec = run?.artifacts?.planner;
  if (!spec) return empty('A specification you can question.', 'The planner will turn the evidence into a focused product proposal. You review it before the builder can act.', '◇');
  const nodes = [];
  if (run.status === 'awaiting_approval') {
    const approval = card('Your decision, before the build.', textParagraph('Review the target user, assumptions, feature scope, acceptance criteria and their tests below. Approval is bound to this specification version, tests included.'),
      el('div', { class: 'approval-hash' }, `Specification hash: ${run.specHash || 'unavailable'}`),
      el('button', { class: 'primary', disabled: state.busy || !run.specHash, onclick: () => action('approve', { specHash: run.specHash }) }, state.busy ? 'Approving…' : 'Approve specification & build →'));
    approval.classList.add('approval-card'); nodes.push(approval);
  }
  nodes.push(card(spec.name || 'Product specification', el('div', { class: 'card-label' }, spec.slug || 'PRODUCT PROPOSAL'),
    el('h4', {}, 'Who it serves'), textParagraph(spec.targetUser), el('h4', {}, 'The problem'), textParagraph(spec.problem), el('h4', {}, 'Product hypothesis'), textParagraph(spec.hypothesis), evidenceTags(spec.evidenceIds)));
  for (const feature of list(spec.features)) nodes.push(card(feature.title || feature.id, textParagraph(feature.description), el('h4', {}, 'Acceptance criteria'), bulletList(feature.acceptanceCriteria), evidenceTags(feature.evidenceIds)));
  if (list(spec.nonGoals).length) nodes.push(card('Outside this prototype', bulletList(spec.nonGoals)));
  if (spec.acceptanceTests) nodes.push(card('Acceptance tests, written before the build',
    textParagraph('The builder must make these pass and cannot edit them. Verification restores and runs this file.'),
    bulletList(list(spec.acceptanceTests.coverage).map((item) => item.testName ? `${str(item.criterion)} → test: ${str(item.testName)}` : `${str(item.criterion)} → manual review: ${str(item.manualReason)}`)),
    el('h4', {}, 'Contract the builder must implement'), el('pre', { class: 'json-view' }, str(spec.acceptanceTests.contract)),
    el('details', { class: 'json-details' }, el('summary', {}, 'Inspect test source'), el('pre', { class: 'json-view' }, str(spec.acceptanceTests.source)))));
  nodes.push(card(null, jsonDetails(spec, 'Inspect complete specification')));
  return nodes;
}

const awarenessStages = [
  ['unaware', 'Unaware', 'Start with a familiar moment.'],
  ['problem_aware', 'Problem aware', 'Name the friction they recognize.'],
  ['solution_aware', 'Solution aware', 'Explain an approach and its tradeoffs.'],
  ['product_aware', 'Product aware', 'Show how this product works.'],
  ['most_aware', 'Most aware', 'Make the next step clear.'],
];
function renderPersonas() {
  const artifact = state.run?.artifacts?.persona;
  if (!artifact) return empty('Understand the person behind the problem.', 'The persona agent turns research into explicit hypotheses, objections, and messaging across five awareness stages.', '◎');
  return [card('From research to a person', textParagraph(artifact.summary), bulletList(artifact.limitations)), ...list(artifact.personas).map((persona) => card(persona.name,
    el('div', { class: 'card-label' }, humanize(persona.confidence), ' · ', persona.segment),
    el('p', { class: 'persona-job' }, persona.jobToBeDone),
    el('div', { class: 'persona-columns' }, el('div', {}, el('h4', {}, 'Triggers'), bulletList(persona.triggers), el('h4', {}, 'Frustrations'), bulletList(persona.frustrations)), el('div', {}, el('h4', {}, 'Desired outcome'), textParagraph(persona.desiredOutcome), el('h4', {}, 'Objections'), bulletList(persona.objections))),
    el('h4', {}, 'Illustrative messaging (not customer quotes)'), bulletList(persona.languageExamples), evidenceTags(persona.evidenceIds),
    el('div', { class: 'awareness-flow' }, ...awarenessStages.map(([stage, label, help]) => {
      const message = list(persona.awareness).find((item) => item.stage === stage);
      return el('div', { class: 'awareness-step' }, el('div', { class: 'card-label' }, label), el('p', {}, message?.belief || help), el('strong', {}, message?.message || 'Messaging pending'), textParagraph(message?.proofNeeded ? `Proof needed: ${message.proofNeeded}` : null), tags(message?.cta ? [message.cta] : []));
    })), jsonDetails(persona)))];
}
function renderDesign() {
  const artifact = state.run?.artifacts?.designer;
  if (!artifact) return empty('A direction grounded in references.', 'The design agent inspects available references and proposes patterns, typography, and layout guidance. Connections shows provider availability.', '◇');
  const direction = artifact.direction || {};
  return [card('Design direction', textParagraph(artifact.summary), ...Object.entries(direction).map(([key, value]) => el('div', {}, el('h4', {}, humanize(key)), textParagraph(str(value)))), bulletList(artifact.limitations)),
    ...list(artifact.patterns).map((pattern) => card(pattern.name, safeLink(pattern.referenceUrl, 'Inspect design reference'), textParagraph(pattern.application), el('h4', {}, 'Adaptation boundary'), textParagraph(pattern.avoidCopying), evidenceTags(pattern.evidenceIds)))];
}
function renderAds() {
  const artifact = state.run?.artifacts?.ads_research;
  if (!artifact) return empty('Study the market’s messaging.', 'Ad research captures observable hooks and angles. Public ad presence does not establish spend, conversions, or creative performance.', '⌕');
  return [card('Ad intelligence', textParagraph(artifact.summary), el('p', { class: 'research-boundary' }, 'Performance is unknown. Public creative observations are not campaign analytics.'), artifact.coverage ? jsonDetails(artifact.coverage, 'Research coverage') : null, bulletList(artifact.limitations)),
    ...list(artifact.ads).map((ad) => card(ad.advertiser, el('div', { class: 'card-label' }, humanize(ad.awarenessStage), ' · ', ad.format), el('h4', {}, ad.hook), textParagraph(ad.angle), safeLink(ad.libraryUrl, 'Open ad library reference'), tags(['Performance unknown']), ...list(ad.evidenceIds).map((id) => { const source = state.run?.sourceDetails?.[id]; return source?.ad ? el('div', { class: 'original-ad-reference' }, el('div', { class: 'card-label' }, source.ad.verification === 'third-party-index' ? 'ORIGINAL COMPETITOR REFERENCE / THIRD-PARTY INDEX' : 'ORIGINAL COMPETITOR REFERENCE / PRIMARY SOURCE'), source.ad.previewFilename ? el('a', { href: `/api/research/previews/${encodeURIComponent(source.ad.previewFilename)}`, target: '_blank', rel: 'noopener noreferrer' }, el('img', { class: 'original-ad-preview', src: `/api/research/previews/${encodeURIComponent(source.ad.previewFilename)}`, alt: `Original ${ad.advertiser} ad creative from a third-party public index`, loading: 'lazy' })) : null, textParagraph(`Source verification: ${str(source.ad.verification)}`), textParagraph(source.ad.verification === 'third-party-index' ? 'Original competitor reference; not a generated draft. Performance unknown. Public indexing does not establish delivery, spend, or results.' : 'Original competitor reference; not a generated draft. Source publication does not establish delivery, spend, or results.'), source.ad.previewUrl ? safeLink(source.ad.previewUrl, 'View original creative reference') : null) : null; }), evidenceTags(ad.evidenceIds)))];
}
function creativeURL(filename) {
  return `/api/runs/${encodeURIComponent(state.run.id)}/creatives/${encodeURIComponent(filename.split(/[\\/]/).pop())}`;
}
function renderCreatives() {
  const run = state.run;
  const artifact = run?.artifacts?.creative;
  if (!artifact) return empty('A launch pack for each level of awareness.', 'After specification approval, the creative agent writes persona-specific concepts and the renderer produces downloadable static assets.', '↗');
  const personas = list(run.artifacts?.persona?.personas);
  const creatives = list(artifact.creatives);
  const pack = run.creativePack || {};
  const selectFilter = (label, current, choices, onChange) => el('label', { class: 'creative-filter' }, label, el('select', { onchange: (event) => { onChange(event.target.value); renderDetail(); } }, ...[['', 'All'], ...choices].map(([value, title]) => el('option', { value, selected: value === current }, title))));
  const visible = creatives.filter((creative) => (!state.personaFilter || creative.personaId === state.personaFilter) && (!state.stageFilter || creative.awarenessStage === state.stageFilter));
  const nodes = [card('Persona-aware creative studio', textParagraph(artifact.summary), el('div', { class: 'awareness-legend' }, ...awarenessStages.map(([, label, help], index) => el('div', {}, el('span', {}, `0${index + 1}`), el('strong', {}, label), el('small', {}, help)))),
    el('div', { class: 'creative-toolbar' }, selectFilter('Persona', state.personaFilter, personas.map((persona) => [persona.id, persona.name]), (value) => { state.personaFilter = value; }), selectFilter('Awareness', state.stageFilter, awarenessStages.map(([value, label]) => [value, label]), (value) => { state.stageFilter = value; }),
      pack.archiveFilename ? el('a', { class: 'primary', href: creativeURL(pack.archiveFilename), download: pack.archiveFilename }, '↓ Complete launch pack') : null,
      pack.dossierFilename ? el('a', { class: 'small-button', href: creativeURL(pack.dossierFilename), download: pack.dossierFilename }, '↓ Research dossier') : null,
      pack.manifestPath ? el('a', { class: 'small-button', href: creativeURL(pack.manifestPath), download: '' }, '↓ Download copy manifest') : null),
    el('p', { class: 'artifact-meta' }, `${visible.length} of ${creatives.length} concepts · Creative drafts for review; no ads have been published.`), bulletList(artifact.limitations))];
  if (pack.coverage) nodes.push(card('Creative coverage', jsonDetails(pack.coverage, 'Persona × awareness coverage')));
  nodes.push(el('div', { class: 'creative-grid' }, ...visible.map((creative) => {
    const assets = list(pack.assets).filter((asset) => asset.creativeId === creative.id);
    const preview = assets.find((asset) => asset.mimeType === 'image/png') || assets.find((asset) => asset.mimeType === 'image/svg+xml');
    const persona = personas.find((item) => item.id === creative.personaId);
    const downloads = assets.map((asset) => el('a', { class: 'small-button', href: creativeURL(asset.filename || asset.path), download: asset.filename || '', 'aria-label': `Download ${creative.id} ${asset.format} ${asset.mimeType}` }, '↓ ', asset.format, ' ', asset.mimeType === 'image/png' ? 'PNG' : 'SVG'));
    return el('article', { class: 'creative-card' }, preview ? el('a', { class: 'creative-preview', href: creativeURL(preview.filename || preview.path), target: '_blank', rel: 'noopener noreferrer' }, el('img', { src: creativeURL(preview.filename || preview.path), alt: `Static ad concept: ${creative.headline}`, loading: 'lazy' })) : el('div', { class: 'creative-preview pending' }, 'Asset rendering pending'),
      el('div', { class: 'creative-copy' }, el('div', { class: 'card-label' }, persona?.name || creative.personaId, ' / ', humanize(creative.awarenessStage)), el('h3', {}, creative.headline), textParagraph(creative.primaryText), tags([creative.cta, creative.angle].filter(Boolean)),
        el('details', { class: 'json-details' }, el('summary', {}, 'Creative rationale & claims'), textParagraph(creative.visualConcept), bulletList(creative.claimNotes), evidenceTags(creative.evidenceIds), tags(creative.designReferenceIds)), el('div', { class: 'asset-downloads' }, ...downloads)));
  })));
  if (run.artifacts?.creative_qa) nodes.push(renderVerification(run.artifacts.creative_qa));
  else if (run.creativeVerification) nodes.push(card('Asset validation', jsonDetails(run.creativeVerification)));
  return nodes;
}
async function refreshConnections() {
  try {
    const result = await api('/api/integrations');
    state.config.integrations = list(result.integrations);
    if (state.tab === 'connections') renderDetail();
  } catch { /* Config endpoint remains the fallback for older runtimes. */ }
}
function renderConnections() {
  const integrations = list(state.config.integrations);
  const nodes = [card('External research connections', textParagraph('MCP providers extend the agents with research and design tools. Connection state reflects local configuration; live authorization and tool calls are recorded in Trace.'), textParagraph('Configure credentials and MCP endpoints in the server environment. Secrets are never entered into this dashboard.'))];
  const providers = { screensdesign: { name: 'ScreensDesign', url: 'https://screensdesign.com/mcp/' }, appgazers: { name: 'AppGazers', url: 'https://appgazers.com/blog/app-market-research-mcp' }, meta_ads: { name: 'Meta ad research', url: 'https://www.facebook.com/ads/library/' } };
  for (const integration of integrations) {
    const provider = providers[integration.id] || {};
    const status = integration.status || (integration.configured ? 'configured' : 'not_configured');
    nodes.push(card(integration.name || provider.name || integration.id, el('div', { class: `integration-state ${status}` }, el('span', { class: 'online-dot' }), humanize(status)), textParagraph(integration.description), safeLink(integration.docsUrl || provider.url || integration.url, 'Provider documentation'), textParagraph(integration.message || integration.detail), (integration.tools || integration.discoveredTools) ? tags(list(integration.tools || integration.discoveredTools).map((tool) => typeof tool === 'string' ? tool : tool.name)) : null));
  }
  if (!integrations.length) nodes.push(card('Provider configuration pending', textParagraph('The runtime has not reported integration status. No provider connection is assumed.')));
  nodes.push(card('Provider references', safeLink('https://screensdesign.com/mcp/', 'ScreensDesign MCP'), el('br'), safeLink('https://appgazers.com/blog/app-market-research-mcp', 'AppGazers market research MCP')));
  return nodes;
}

function renderTrace() {
  const events = list(state.run?.events);
  if (!events.length) return empty('An execution you can inspect.', 'Tool calls, decisions, handoffs, failures, and approvals appear here as a persistent event stream.', '≋');
  return [...events].reverse().map((event, index) => {
    const key = str(event.id || `${event.at}-${event.type}-${index}`);
    const details = el('details', { class: 'trace-entry', open: state.openedEvents.has(key) },
      el('summary', {}, el('time', { datetime: event.at }, shortTime(event.at)), el('span', { class: 'trace-role' }, humanize(event.role || 'system')), el('span', { class: 'trace-type' }, humanize(event.type))),
      el('pre', {}, JSON.stringify(event.data ?? {}, null, 2)));
    details.addEventListener('toggle', () => { if (details.open) state.openedEvents.add(key); else state.openedEvents.delete(key); });
    return details;
  });
}

function renderCode() {
  if (!state.run?.artifacts?.builder && !state.files.length) return empty('A concrete handoff.', 'Generated files will be available after the approved specification reaches the builder. The prototype stays in its own workspace.', '{ }');
  if (!state.files.length) return empty('No generated files yet.', 'The workspace has not produced readable files. The execution trace contains the builder’s current progress.', '{ }');
  return el('div', { class: 'code-layout' }, el('nav', { class: 'file-list', 'aria-label': 'Generated source files' }, ...state.files.map((path) => el('button', { class: `file-button${state.selectedFile === path ? ' selected' : ''}`, onclick: () => loadFile(path), title: path }, path))),
    el('div', { class: 'code-content' }, el('div', { class: 'code-path' }, state.selectedFile || 'Select a file'), el('pre', {}, el('code', {}, state.fileContent || 'Select a generated source file to inspect it.'))));
}

function renderDetail() {
  const renderers = { overview: renderOverview, evidence: renderEvidence, specification: renderSpecification, trace: renderTrace, code: renderCode, personas: renderPersonas, design: renderDesign, ads: renderAds, creatives: renderCreatives, connections: renderConnections };
  const content = renderers[state.tab]();
  $('#detail-panel').replaceChildren(...(Array.isArray(content) ? content : [content]));
}

function updateRun(run) {
  if (state.run?.id === run.id && Date.parse(run.updatedAt) < Date.parse(state.run.updatedAt)) return;
  const changed = !state.run || JSON.stringify(state.run) !== JSON.stringify(run);
  state.run = run;
  sessionStorage.setItem('venture-studio-run', run.id);
  const index = state.runs.findIndex((item) => item.id === run.id);
  if (index >= 0) state.runs[index] = run; else state.runs.unshift(run);
  if (!changed) return;
  $('#breadcrumb').textContent = run.brief || run.id;
  $('#event-count').textContent = String(list(run.events).length);
  renderHistory(); renderPipeline(); renderBudget(); renderActions(); renderMode(); renderDetail();
  if (state.tab === 'code') loadFiles();
}

async function selectRun(id) {
  try {
    const run = await api(`/api/runs/${encodeURIComponent(id)}`);
    if (state.run?.id !== id) { state.files = []; state.fileRun = null; state.selectedFile = null; state.fileContent = ''; state.openedEvents.clear(); }
    updateRun(run); showError(null);
  } catch (error) { showError(error); }
}

async function loadFiles() {
  const id = state.run?.id;
  if (!id || !state.run.workspace) return;
  try {
    const result = await api(`/api/runs/${encodeURIComponent(id)}/files`);
    if (state.run?.id !== id) return;
    // The source tools can read the foundation before generation; never label it as a generated app.
    const files = result.source === 'foundation' ? [] : list(result.files);
    const changed = JSON.stringify(files) !== JSON.stringify(state.files) || state.fileRun !== id;
    state.files = files; state.fileRun = id;
    if (changed && state.tab === 'code') renderDetail();
    if (files.length && (!state.selectedFile || !files.includes(state.selectedFile))) {
      const preferred = list(state.run.artifacts?.builder?.files).find((file) => files.includes(file)) || files.find((file) => file.startsWith('src/features/venture/')) || files[0];
      await loadFile(preferred);
    }
  } catch (error) { if (state.tab === 'code') showError(error); }
}

async function loadFile(path) {
  const id = state.run?.id;
  state.selectedFile = path;
  state.fileContent = 'Loading source…';
  if (state.tab === 'code') renderDetail();
  try {
    const result = await api(`/api/runs/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`);
    if (state.run?.id !== id || state.selectedFile !== path) return;
    state.selectedFile = path; state.fileContent = str(result.content);
    if (state.tab === 'code') renderDetail();
  } catch (error) { showError(error); }
}

async function launchSample(sample) {
  if (state.busy) return;
  state.busy = true; renderSamples(); showError(null);
  try {
    const run = await api(`/api/samples/${encodeURIComponent(sample.id)}`, { method: 'POST', body: '{}' });
    state.files = []; state.fileContent = ''; state.selectedFile = null; state.personaFilter = ''; state.stageFilter = ''; state.openedEvents.clear();
    updateRun(run); setTab('overview'); toast('Curated research sample started. Review the specification before building.');
  } catch (error) { showError(error); }
  finally { state.busy = false; renderSamples(); }
}
function renderSamples() {
  const samples = list(state.config.samples);
  $('#sample-launches').replaceChildren(...samples.map((sample) => el('button', { class: 'sample-launch', disabled: state.busy, onclick: () => launchSample(sample) }, el('span', { class: 'card-label' }, 'Sample'), el('strong', {}, sample.name, ' ↗'), el('small', {}, sample.description))));
}
function newRun() {
  state.run = null; state.files = []; state.selectedFile = null; state.fileContent = ''; state.openedEvents.clear();
  sessionStorage.removeItem('venture-studio-run');
  $('#breadcrumb').textContent = 'New investigation'; $('#event-count').textContent = '0';
  renderHistory(); renderPipeline(); renderBudget(); renderActions(); renderMode(); setTab('overview'); showError(null);
  $('#brief').focus(); $('#mission-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#mission-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const brief = $('#brief').value.trim();
  if (brief.length < 12) { showError(new Error('Describe the market question in at least 12 characters.')); return; }
  state.busy = true; $('#launch').disabled = true; $('#launch').textContent = 'Starting the team…'; showError(null);
  try {
    const run = await api('/api/runs', { method: 'POST', body: JSON.stringify({ brief, mode: $('#run-mode').value, injectFailure: $('#inject-failure').checked }) });
    state.files = []; state.selectedFile = null; state.fileContent = ''; state.openedEvents.clear();
    state.personaFilter = ''; state.stageFilter = '';
    updateRun(run); setTab('overview'); toast('Investigation started. Follow the team below.');
  } catch (error) { showError(error); }
  finally { state.busy = false; $('#launch').disabled = false; $('#launch').replaceChildren('Launch investigation'); renderActions(); }
});
$('#new-run').addEventListener('click', newRun);
$('#run-mode').addEventListener('change', renderMode);
document.querySelectorAll('[role="tab"]').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
  button.addEventListener('keydown', (event) => {
    const buttons = [...document.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(button);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next != null) { event.preventDefault(); setTab(buttons[next].dataset.tab, true); }
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); newRun(); }
});

async function initialize() {
  renderPipeline(); renderBudget(); renderDetail();
  const results = await Promise.allSettled([api('/api/config'), api('/api/runs')]);
  if (results[0].status === 'fulfilled') {
    state.config = { ...state.config, ...results[0].value, roles: list(results[0].value.roles).length ? results[0].value.roles : fallbackRoles };
    $('#live-option').disabled = !state.config.liveAvailable;
    $('#live-option').textContent = state.config.liveAvailable ? 'Live agents' : 'Live agents (API key needed)';
    $('#connection-status').textContent = 'Local runtime connected';
    renderPipeline(); renderMode(); renderSamples();
  } else { $('#connection-status').textContent = 'Runtime unavailable'; $('#connection-dot').style.background = '#f49a9a'; showError(results[0].reason); }
  if (results[1].status === 'fulfilled') { state.runs = list(results[1].value.runs); renderHistory(); }
  else showError(results[1].reason);
  const lastId = sessionStorage.getItem('venture-studio-run');
  if (lastId && state.runs.some((run) => run.id === lastId)) await selectRun(lastId);
}

let pollTick = 0;
setInterval(async () => {
  if (state.polling || document.hidden) return;
  state.polling = true;
  try {
    const id = state.run?.id;
    if (id && ['running', 'awaiting_approval', 'paused'].includes(state.run.status)) {
      const run = await api(`/api/runs/${encodeURIComponent(id)}`);
      if (state.run?.id === id) updateRun(run);
    }
    if (++pollTick % 4 === 0) { const result = await api('/api/runs'); state.runs = list(result.runs); renderHistory(); }
    $('#connection-status').textContent = 'Local runtime connected'; $('#connection-dot').style.background = '';
  } catch (error) { $('#connection-status').textContent = 'Connection interrupted'; $('#connection-dot').style.background = '#f49a9a'; }
  finally { state.polling = false; }
}, 1200);

initialize();
