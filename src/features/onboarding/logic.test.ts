import { describe, expect, it } from '@jest/globals';

import type { OnboardingStep } from '@/config/app-definition-types';
import { appDefinition } from '@/config/app-definition';
import { onboardingExamples } from '@/config/onboarding-examples';
import { canAdvance, conditionMatches, hasAnswer, interpolate, stepIsVisible } from './logic';

describe('onboarding logic', () => {
  const select: OnboardingStep = { id: 's', type: 'select', title: 'T', answerKey: 'goal', options: [] };
  it('requires an answer for required steps', () => {
    expect(canAdvance(select, {})).toBe(false);
    expect(canAdvance(select, { goal: 'calm' })).toBe(true);
  });
  it('never blocks steps with defaults or no answer', () => {
    expect(canAdvance({ id: 'd', type: 'date', title: 'T', answerKey: 'x' }, {})).toBe(true);
    expect(canAdvance({ id: 'c', type: 'chart', title: 'T' }, {})).toBe(true);
    expect(canAdvance({ id: 't', type: 'text', title: 'T', answerKey: 'n', optional: true }, {})).toBe(true);
  });
  it('evaluates conditions', () => {
    const step: OnboardingStep = { id: 'n', type: 'info', title: 'T', when: { answer: 'topics', includes: 'x' } };
    expect(stepIsVisible(step, { topics: ['x'] })).toBe(true);
    expect(stepIsVisible(step, { topics: ['y'] })).toBe(false);
  });
  it('interpolates answers', () => expect(interpolate('Hi {{answers.name}}', { name: 'Sam' })).toBe('Hi Sam'));
  it('has unique step ids in config and examples', () => {
    for (const steps of [appDefinition.onboarding, onboardingExamples]) {
      const ids = steps.map(step => step.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('places tracking before the paywall so AppsFlyer can attribute purchases', () => {
    const ids = appDefinition.onboarding.map(step => step.type);
    const tracking = ids.indexOf('permission');
    expect(tracking).toBeGreaterThanOrEqual(0);
    expect(tracking).toBeLessThan(ids.indexOf('paywall'));
  });
});

describe('conditionMatches', () => {
  it('treats empty strings as missing for exists checks', () => {
    expect(conditionMatches({ answer: 'name', exists: true }, { name: '' })).toBe(false);
    expect(conditionMatches({ answer: 'name', exists: true }, { name: 'Ari' })).toBe(true);
    expect(conditionMatches({ answer: 'name', exists: false }, {})).toBe(true);
  });
  it('matches includes against single answers and equals exactly', () => {
    expect(conditionMatches({ answer: 'goal', includes: 'calm' }, { goal: 'calm' })).toBe(true);
    expect(conditionMatches({ answer: 'goal', equals: 'calm' }, { goal: 'focus' })).toBe(false);
    expect(conditionMatches({ answer: 'age', equals: 30 }, { age: 30 })).toBe(true);
  });
});

describe('interpolate', () => {
  it('joins multi-select answers and tidies missing values', () => {
    expect(interpolate('You chose {{answers.topics}}.', { topics: ['sleep', 'focus'] })).toBe('You chose sleep, focus.');
    expect(interpolate('Hi {{answers.name}}, welcome', {})).toBe('Hi, welcome');
    expect(interpolate(undefined, {})).toBe('');
  });
});

describe('hasAnswer', () => {
  it('rejects empty values and accepts real ones', () => {
    expect(hasAnswer(undefined)).toBe(false);
    expect(hasAnswer('')).toBe(false);
    expect(hasAnswer([])).toBe(false);
    expect(hasAnswer(0)).toBe(true);
    expect(hasAnswer(['a'])).toBe(true);
  });
});

describe('canAdvance for multi-select', () => {
  it('blocks an empty selection list', () => {
    const step: OnboardingStep = { id: 'm', type: 'select', title: 'T', answerKey: 'topics', multiple: true, options: [] };
    expect(canAdvance(step, { topics: [] })).toBe(false);
    expect(canAdvance(step, { topics: ['sleep'] })).toBe(true);
  });
});
