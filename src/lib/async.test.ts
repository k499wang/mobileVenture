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
});
