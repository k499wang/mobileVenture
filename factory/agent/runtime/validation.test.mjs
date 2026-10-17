import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, validate, validateAcceptanceTests, validateReferences } from './validation.mjs';
import { demoArtifact } from '../agents/roles.mjs';

const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, count: { type: 'number' } } };

test('objects reject unknown fields with a precise location', () => {
  assert.throws(() => validate(schema, { name: 'a', extra: 1 }), /\$\.extra: unknown field/);
});

test('objects require declared fields and reject arrays or null', () => {
  assert.throws(() => validate(schema, {}), /\$\.name: required/);
  assert.throws(() => validate(schema, []), /expected object/);
  assert.throws(() => validate(schema, null), /expected object/);
});

test('enum, minimum and maximum bounds are enforced', () => {
  assert.equal(validate({ type: 'string', enum: ['a', 'b'] }, 'a'), 'a');
  assert.throws(() => validate({ type: 'string', enum: ['a', 'b'] }, 'c'), /invalid choice/);
  assert.throws(() => validate({ type: 'number', minimum: 1 }, 0), /below minimum/);
  assert.throws(() => validate({ type: 'number', maximum: 1 }, 2), /above maximum/);
});

test('strings and arrays respect field and global limits', () => {
  assert.throws(() => validate({ type: 'string', maxLength: 3 }, 'abcd'), /exceeds field limit/);
  assert.throws(() => validate({ type: 'string' }, 'x'.repeat(40_001)), /string too large/);
  assert.throws(() => validate({ type: 'array', items: { type: 'number' } }, Array(101).fill(1)), /item limit/);
  assert.throws(() => validate({ type: 'array', items: { type: 'number' }, maxItems: 2 }, [1, 2, 3]), /item limit/);
  assert.throws(() => validate({ type: 'array', items: { type: 'number' } }, [1, 'two']), /\$\[1\]: expected number/);
});

test('numbers must be finite', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => validate({ type: 'number' }, value), /expected number/);
});

test('digest is a stable sha256 of the JSON form', () => {
  assert.equal(digest({ a: 1 }), digest({ a: 1 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
  assert.match(digest([]), /^[0-9a-f]{64}$/);
});

test('decisions must cite known evidence', () => {
  const artifacts = { researcher: { evidence: [{ id: 'e1' }] } };
  assert.throws(() => validateReferences('analyst', { opportunities: [{ evidenceIds: [] }] }, artifacts, { mode: 'demo' }), /at least one evidence/);
  assert.throws(() => validateReferences('analyst', { opportunities: [{ evidenceIds: ['e9'] }] }, artifacts, { mode: 'demo' }), /Unknown evidence reference: e9/);
  assert.throws(() => validateReferences('analyst', { opportunities: [] }, artifacts, { mode: 'demo' }), /No opportunity/);
});

test('planner slugs must be safe lowercase identifiers', () => {
  const artifacts = { researcher: { evidence: [{ id: 'e1' }] } };
  const plan = slug => ({ slug, evidenceIds: ['e1'], features: [{ id: 'f1', evidenceIds: ['e1'], acceptanceCriteria: ['works'] }],
    acceptanceTests: { contract: '', source: "import { it } from '@jest/globals';\nit('works', () => {});\n", coverage: [{ featureId: 'f1', criterion: 'works', testName: 'works', manualReason: '' }] } });
  assert.ok(validateReferences('planner', plan('shift-flow'), artifacts, { mode: 'demo' }));
  for (const slug of ['Shift', '../x', '1app', 'a']) assert.throws(() => validateReferences('planner', plan(slug), artifacts, { mode: 'demo' }), /safe lowercase/);
});

test('planner acceptance tests must cover every criterion with a real test or a manual-review reason', () => {
  const spec = () => structuredClone(demoArtifact('planner'));
  assert.doesNotThrow(() => validateAcceptanceTests(spec()));
  const missing = spec(); missing.acceptanceTests.coverage.pop();
  assert.throws(() => validateAcceptanceTests(missing), /no test or manual-review reason/);
  const phantom = spec(); phantom.acceptanceTests.coverage[0].testName = 'a test that was never written';
  assert.throws(() => validateAcceptanceTests(phantom), /not found in source/);
  const both = spec(); both.acceptanceTests.coverage[0].manualReason = 'Also manual';
  assert.throws(() => validateAcceptanceTests(both), /either a test name or a manual-review reason/);
  const allManual = spec(); allManual.acceptanceTests.coverage.forEach(item => { item.testName = ''; item.manualReason = 'Review by hand'; });
  assert.throws(() => validateAcceptanceTests(allManual), /At least one/);
  const absent = spec(); delete absent.acceptanceTests;
  assert.throws(() => validateAcceptanceTests(absent), /must include acceptance tests/);
});

test('planner acceptance tests may import only jest globals and the feature model', () => {
  const spec = structuredClone(demoArtifact('planner'));
  for (const source of [`import fs from 'node:fs';\n`, `import { x } from '@/services/user-data';\n`, `const fs = require('fs');\n`, `await import('node:fs');\n`]) {
    const changed = structuredClone(spec);
    changed.acceptanceTests.source = source + changed.acceptanceTests.source;
    assert.throws(() => validateAcceptanceTests(changed), /import only|dynamically/);
  }
});
