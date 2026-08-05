import { describe, expect, it } from '@jest/globals';

import { en } from './en';
import { isTranslationKey, setLanguage, t } from '.';

describe('t', () => {
  it('translates keys', () => expect(t('common.continue')).toBe('Continue'));
  it('passes plain text through', () => expect(t('Hello there')).toBe('Hello there'));
  it('fills params and leaves onboarding placeholders alone', () => {
    expect(t('settings.version', { version: '1.0' })).toBe('Version 1.0');
    expect(t('Hi {{answers.name}}')).toBe('Hi {{answers.name}}');
  });
  it('falls back to English for unregistered languages', () => {
    setLanguage('xx');
    expect(t('common.continue')).toBe('Continue');
    expect(isTranslationKey('common.continue')).toBe(true);
    expect(isTranslationKey('Not a key')).toBe(false);
  });
  it('has no empty English strings', () => {
    for (const [key, value] of Object.entries(en)) expect([key, value.trim().length > 0]).toEqual([key, true]);
  });
});
