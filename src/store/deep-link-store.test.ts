import { beforeEach, describe, expect, it } from '@jest/globals';

import { useDeepLinkStore } from './deep-link-store';

describe('deep link store', () => {
  beforeEach(() => useDeepLinkStore.getState().consume());

  it('accepts allowed destinations and clears them on consume', () => {
    useDeepLinkStore.getState().receive('settings');
    expect(useDeepLinkStore.getState().pending).toBe('settings');
    useDeepLinkStore.getState().consume();
    expect(useDeepLinkStore.getState().pending).toBeNull();
  });
});
