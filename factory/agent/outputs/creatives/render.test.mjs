import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AWARENESS_STAGES, renderCreativePack, validateCreativePack } from './render.mjs';

const artifact = () => ({
  summary: 'Concepts',
  creatives: AWARENESS_STAGES.map((awarenessStage, i) => ({
    id: `ad-${i}`,
    personaId: 'busy-builder',
    awarenessStage,
    headline: 'A little room to begin',
    hook: 'Make the next step feel possible.',
    primaryText: '=Never a formula',
    description: 'Explore a different routine.',
    cta: 'Explore the concept',
    angle: 'Small steps',
    palette: 'mint',
    layout: 'editorial',
    evidenceIds: ['e1'],
    designReferenceIds: ['d1'],
    claimNotes: ['No results promised.'],
  })),
  limitations: ['Concepts need user testing.'],
});
test('renders actual PNGs, editable SVGs and copy; coverage and rerendering are deterministic', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'venture-creatives-'));
  const input = {
    runDir,
    brand: 'Day & <Night>',
    personaArtifact: { personas: [{ id: 'busy-builder' }] },
    creativeArtifact: artifact(),
  };
  const result = await renderCreativePack(input);
  assert.equal(result.assets.length, 30);
  assert.equal(result.qa.ok, true);
  const first = result.assets.find((a) => a.mimeType === 'image/png');
  const before = await readFile(path.join(runDir, first.path));
  assert.equal(before.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(before.readUInt32BE(16), 1080);
  const svg = await readFile(path.join(runDir, result.assets[0].path), 'utf8');
  assert.match(svg, /Day &amp; &lt;Night&gt;/);
  assert.doesNotMatch(svg, /<Night>/);
  assert.match(await readFile(path.join(runDir, 'creatives/ad-copy.csv'), 'utf8'), /'=Never a formula/);
  await renderCreativePack(input);
  assert.deepEqual(await readFile(path.join(runDir, first.path)), before);
  await writeFile(path.join(runDir, first.path), 'invalid');
  assert.equal((await validateCreativePack({ runDir })).ok, false);
});
test('coverage fails independently for a persona missing awareness stages', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'venture-creatives-'));
  const result = await renderCreativePack({
    runDir,
    creativeArtifact: artifact(),
    personaArtifact: { personas: [{ id: 'busy-builder' }, { id: 'missing-persona' }] },
  });
  assert.equal(result.qa.ok, false);
  assert.equal(result.qa.checks.filter((c) => !c.passed).length, 5);
});
test('rejects traversal, duplicate IDs, excessive copy and symlink output directories', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'venture-creatives-'));
  for (const mutate of [
    (a) => {
      a.creatives[0].id = '../escape';
    },
    (a) => {
      a.creatives[0].id = a.creatives[1].id;
    },
    (a) => {
      a.creatives[0].headline = 'x'.repeat(300);
    },
  ]) {
    const a = artifact();
    mutate(a);
    await assert.rejects(renderCreativePack({ runDir, creativeArtifact: a }));
  }
  const target = await mkdtemp(path.join(os.tmpdir(), 'venture-creatives-target-'));
  await symlink(target, path.join(runDir, 'creatives'));
  await assert.rejects(
    renderCreativePack({ runDir, creativeArtifact: artifact() }),
    /Unsafe creatives directory/,
  );
});
test('never follows an existing output file symlink', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'venture-creatives-'));
  const result = await renderCreativePack({ runDir, creativeArtifact: artifact() });
  const victim = path.join(runDir, 'victim');
  await writeFile(victim, 'keep me');
  // A supplemental named symlink is rejected by the manifest reader, without reading its target.
  await symlink(victim, path.join(runDir, 'creatives/linked.png'));
  const report = await validateCreativePack({
    runDir,
    creativePack: { assets: [{ ...result.assets[1], filename: 'linked.png', path: 'creatives/linked.png' }] },
  });
  assert.equal(report.ok, false);
  assert.equal(await readFile(victim, 'utf8'), 'keep me');
});
