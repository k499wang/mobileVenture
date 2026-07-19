import { describe, expect, it } from '@jest/globals';

import { createQueue, withTimeout } from './async';

describe('createQueue', () => {
  it('runs operations one at a time in submission order', async () => {
    const run = createQueue();
    const log: string[] = [];
    const step = (name: string, ms: number) => () => new Promise<string>(resolve => setTimeout(() => { log.push(name); resolve(name); }, ms));
    const results = await Promise.all([run(step('a', 20)), run(step('b', 0)), run(step('c', 5))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a', 'b', 'c']);
  });
  it('keeps running after an operation rejects', async () => {
    const run = createQueue();
    const failed = run(() => Promise.reject(new Error('billing down')));
    const next = run(() => Promise.resolve('restored'));
    await expect(failed).rejects.toThrow('billing down');
    await expect(next).resolves.toBe('restored');
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve(7), 50, 'fast')).resolves.toBe(7);
  });
  it('rejects with a labeled error when the deadline passes', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, 'offerings')).rejects.toThrow('offerings timed out');
  });
  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 50, 'x')).rejects.toThrow('nope');
  });
});
