import { beforeEach, describe, expect, it } from '@jest/globals';

import { useAppStore } from './app-store';

describe('app store', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('updates the Pro entitlement state', () => {
    useAppStore.getState().setIsPro(true);
    expect(useAppStore.getState().isPro).toBe(true);
  });
});
