import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, validate } from './validation.mjs';

const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' }, count: { type: 'number' } } };

test('objects reject unknown fields with a precise location', () => {
  assert.throws(() => validate(schema, { name: 'a', extra: 1 }), /\$\.extra: unknown field/);
});

test('objects require declared fields and reject arrays or null', () => {
  assert.throws(() => validate(schema, {}), /\$\.name: required/);
  assert.throws(() => validate(schema, []), /expected object/);
  assert.throws(() => validate(schema, null), /expected object/);
});
