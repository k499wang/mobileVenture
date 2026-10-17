import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, applySampleArtifact, sampleScreenCopy } from './samples.mjs';
const stages = ['unaware', 'problem_aware', 'solution_aware', 'product_aware', 'most_aware'];
test('sample mapping preserves curated source provenance without manufacturing evidence', () => {
  const artifact = { summary: 'Curated review observations', evidence: [{ id: 'need-flexibility', url: 'https://reddit.com/r/example/comments/example', claim: 'A source-backed observation.', fixture: false }] };
  for (const sample of SAMPLES) for (const role of ['researcher', 'competitor', 'designer', 'ads_research']) assert.deepEqual(applySampleArtifact(role, { sampleId: sample.id }, artifact), artifact);
  const curated = { researcher: artifact };
  assert.deepEqual(applySampleArtifact('researcher', { sampleId: SAMPLES[0].id, curatedResearch: curated }, {}), artifact);
});
test('sample creative matrix preserves identity and makes bounded product claims', () => {
  const artifact = { creatives: ['changing-days', 'small-step-starter'].flatMap(personaId => stages.map(awarenessStage => ({ id: `${personaId}-${awarenessStage}`, personaId, awarenessStage, evidenceIds: ['need-flexibility'], designReferenceIds: ['design-flexible-list'] }))) };
  for (const sample of SAMPLES) {
    const mapped = applySampleArtifact('creative', { sampleId: sample.id }, artifact);
    assert.equal(mapped.creatives.length, 10);
    for (const [index, creative] of mapped.creatives.entries()) {
      assert.equal(creative.id, artifact.creatives[index].id);
      assert.deepEqual(creative.evidenceIds, artifact.creatives[index].evidenceIds);
      assert.ok(creative.headline.length <= 54);
      assert.ok(creative.hook.length <= 90);
      assert.ok(creative.cta.length <= 28);
      assert.doesNotMatch(creative.primaryText, /diagnos|treat|timer|AI decomposition/i);
    }
    assert.ok(sampleScreenCopy(sample.id).title);
  }
});
test('unknown sample is a no-op and input artifacts remain unchanged', () => {
  const artifact = { name: 'Original', features: [], evidenceIds: [] };
  assert.equal(applySampleArtifact('planner', {}, artifact), artifact);
  const mapped = applySampleArtifact('planner', { sampleId: 'focus-starter' }, artifact);
  assert.equal(artifact.name, 'Original');
  assert.equal(mapped.name, 'Focus Pocket');
  assert.ok(mapped.features[0].acceptanceCriteria.some(x => x.includes('manually')));
});
