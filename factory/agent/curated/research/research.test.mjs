import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadCuratedResearch } from './index.mjs';
import { SAMPLES } from '../samples.mjs';
import { artifactSchemas, demoArtifact } from '../../agents/roles.mjs';
import { validate, validateReferences } from '../../runtime/validation.mjs';

test('curated snapshots contain real-source reviews, attribution limits and intact original ad references', async () => {
  const curated = await loadCuratedResearch();
  assert.equal(curated.records.length, 27);
  assert.equal(curated.records.filter(record => record.sourceType === 'reddit-firsthand').length, 9);
  assert.equal(curated.records.filter(record => record.sourceType === 'app-store-review').length, 9);
  assert(curated.records.every(record => record.fixture === false && !record.url.includes('.example')));
  const previews = curated.records.filter(record => record.ad?.previewFilename);
  assert.equal(previews.length, 2);
  for (const source of previews) {
    const bytes = await readFile(new URL(`./previews/${source.ad.previewFilename}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.ad.previewSha256);
    assert.equal(source.ad.verification, 'third-party-index');
    assert.equal(source.ad.performance, 'unknown');
  }
});

test('all three sample decision chains validate against real curated evidence, not synthetic IDs', async () => {
  const curated = await loadCuratedResearch();
  for (const sample of SAMPLES) {
    const artifacts = {};
    for (const role of ['researcher', 'competitor', 'designer', 'ads_research', 'analyst', 'persona', 'critic', 'planner', 'creative']) {
      const artifact = demoArtifact(role, { sampleId: sample.id, curatedResearch: curated.artifacts, artifacts, brief: sample.brief });
      validate(artifactSchemas[role], artifact);
      validateReferences(role, artifact, artifacts, { mode: 'curated', sources: curated.sources[role] ?? [] });
      artifacts[role] = artifact;
    }
    assert.equal(artifacts.planner.name, sample.name);
    assert.equal(artifacts.creative.creatives.length, 10);
    assert(!JSON.stringify(artifacts).includes('research.example'));
    assert(!JSON.stringify(artifacts).includes('need-flexibility'));
  }
});
