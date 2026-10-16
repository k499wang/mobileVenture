import test from 'node:test';
import assert from 'node:assert/strict';
import { zipFiles } from './launch-pack.mjs';

test('launch archive has matching local and central entries and a standard CRC32', () => {
  const result = zipFiles([{ name: 'copy.txt', content: '123456789' }]);
  assert.equal(result.readUInt32LE(0), 0x04034b50);
  assert.equal(result.readUInt32LE(14), 0xcbf43926);
  assert.equal(result.readUInt32LE(18), 9);
  const end = result.length - 22;
  assert.equal(result.readUInt32LE(end), 0x06054b50);
  assert.equal(result.readUInt16LE(end + 10), 1);
  const central = result.readUInt32LE(end + 16);
  assert.equal(result.readUInt32LE(central), 0x02014b50);
  assert.equal(result.readUInt32LE(central + 42), 0);
  assert(result.equals(zipFiles([{ name: 'copy.txt', content: '123456789' }])));
  assert.throws(() => zipFiles([{ name: '../secret', content: '' }]), /Unsafe/);
});
