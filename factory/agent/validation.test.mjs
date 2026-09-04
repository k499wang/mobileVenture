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

test('enum, minimum and maximum bounds are enforced', () => {
  assert.equal(validate({ type: 'string', enum: ['a', 'b'] }, 'a'), 'a');
  assert.throws(() => validate({ type: 'string', enum: ['a', 'b'] }, 'c'), /invalid choice/);
  assert.throws(() => validate({ type: 'number', minimum: 1 }, 0), /below minimum/);
  assert.throws(() => validate({ type: 'number', maximum: 1 }, 2), /above maximum/);
});
