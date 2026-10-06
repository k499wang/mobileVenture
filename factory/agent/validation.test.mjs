import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, validate, validateReferences } from './validation.mjs';

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
