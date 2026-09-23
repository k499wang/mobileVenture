import test from 'node:test';
import assert from 'node:assert/strict';
import { demoArtifact, artifactSchemas, ROLES } from './roles.mjs';
import { validate, validateReferences } from './validation.mjs';
import { AWARENESS_STAGES, RESEARCH_ROLES } from './growth.mjs';

function artifacts() {
  const result = {};
  for (const role of [...RESEARCH_ROLES, 'analyst', 'persona', 'critic', 'planner', 'creative']) {
    result[role] = demoArtifact(role, { artifacts: result, round: 1 });
  }
  return result;
}

test('all thirteen roles have validated demo contracts, evidence and a complete persona-awareness matrix', () => {
  assert.equal(ROLES.length, 13);
  const all = artifacts();
  for (const [role, artifact] of Object.entries(all)) {
    validate(artifactSchemas[role], artifact);
    validateReferences(role, artifact, all, { mode: 'demo' });
  }
  assert.equal(all.creative.creatives.length, 10);
  for (const persona of all.persona.personas) for (const stage of AWARENESS_STAGES) {
    assert.equal(all.creative.creatives.filter(item => item.personaId === persona.id && item.awarenessStage === stage).length, 1);
  }
});

test('persona stages cannot be duplicated or omitted and creative cells require real references', () => {
  const all = artifacts();
  const persona = structuredClone(all.persona);
  persona.personas[0].awareness[0].stage = 'most_aware';
  assert.throws(() => validateReferences('persona', persona, all, { mode: 'demo' }), /five awareness/);
  const creative = structuredClone(all.creative);
  creative.creatives[0].designReferenceIds = ['invented-screen'];
  assert.throws(() => validateReferences('creative', creative, all, { mode: 'demo' }), /Unknown design/);
  creative.creatives[0].designReferenceIds = [];
  creative.creatives[0].personaId = 'invented-persona';
  assert.throws(() => validateReferences('creative', creative, all, { mode: 'demo' }), /Unknown creative persona/);
});

test('ad research cannot manufacture performance metrics and design references require retrieved evidence', () => {
  const all = artifacts();
  const ads = structuredClone(all.ads_research);
  ads.ads[0].performance = 'high ROAS';
  assert.throws(() => validate(artifactSchemas.ads_research, ads), /invalid choice/);
  const design = structuredClone(all.designer);
  design.patterns[0].referenceUrl = 'https://invented.example/screen';
  assert.throws(() => validateReferences('designer', design, all, { mode: 'demo' }), /retrieved evidence/);
});

test('creative copy respects export bounds before reaching the renderer', () => {
  const creative = artifacts().creative;
  creative.creatives[0].headline = 'x'.repeat(55);
  assert.throws(() => validate(artifactSchemas.creative, creative), /field limit/);
});

test('awareness stages stay in funnel order', () => {
  assert.deepEqual(AWARENESS_STAGES, ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware']);
});
