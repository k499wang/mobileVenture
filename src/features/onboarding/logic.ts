import type { Answer, Answers, Condition, OnboardingStep } from '@/config/app-definition-types';

export function stepIsVisible(step: OnboardingStep, answers: Answers) { return !step.when || conditionMatches(step.when, answers); }
export function conditionMatches(condition: Condition, answers: Answers) {
  const value = answers[condition.answer];
  if (condition.exists !== undefined) return condition.exists ? value !== undefined && value !== '' : value === undefined || value === '';
  if (condition.includes !== undefined) return Array.isArray(value) ? value.includes(condition.includes) : value === condition.includes;
  return value === condition.equals;
}
export function interpolate(template: string | undefined, answers: Answers) {
  return (template ?? '').replace(/{{answers\.([a-zA-Z0-9_-]+)}}/g, (_, key: string) => {
    const value = answers[key]; return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }).replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
}
export function hasAnswer(value: Answer | undefined) { return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ''; }

/** Steps with a default value (slider, date) or `optional: true` never block Continue. */
export function canAdvance(step: OnboardingStep, answers: Answers) {
  if (step.type === 'slider' || step.type === 'date') return true;
  if (!('answerKey' in step)) return true;
  if ('optional' in step && step.optional) return true;
  return hasAnswer(answers[step.answerKey]);
}
