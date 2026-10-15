import { describe, expect, it } from '@jest/globals';

import { t } from '.';

describe('t', () => {
  it('translates keys', () => expect(t('common.continue')).toBe('Continue'));
  it('passes plain text through', () => expect(t('Hello there')).toBe('Hello there'));
  it('fills params and leaves onboarding placeholders alone', () => {
    expect(t('settings.version', { version: '1.0' })).toBe('Version 1.0');
    expect(t('Hi {{answers.name}}')).toBe('Hi {{answers.name}}');
  });
});
