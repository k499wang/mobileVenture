import { describe, expect, it } from '@jest/globals';

import type { OnboardingStep } from '@/config/app-definition-types';
import { appDefinition } from '@/config/app-definition';
import { onboardingExamples } from '@/config/onboarding-examples';
import { canAdvance, interpolate, stepIsVisible } from './logic';

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
