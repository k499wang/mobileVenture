import type { OnboardingStep } from '@/config/app-definition-types';

/**
 * Copy-paste reference: one example of every onboarding step kind.
 * This file is not used at runtime. Paste entries into `appDefinition.onboarding`.
 *
 * Shared fields on every step:
 *   id      unique and stable (analytics uses it)
 *   title   plain text or an i18n key; supports {{answers.someKey}}
 *   body?   same as title
 *   cta?    button label (default "Continue")
 *   mascot? a pose name from components/mascot.tsx, shown above the title
 *   when?   { answer: 'goal', equals: 'calm' } | { answer: 'interests', includes: 'habits' } | { answer: 'firstName', exists: true }
 */
export const onboardingExamples: readonly OnboardingStep[] = [
  // Text, optional image or GIF.
  { id: 'welcome', type: 'info', title: 'Welcome', body: 'One sentence of value.', image: { uri: 'https://example.com/hero.gif', accessibilityLabel: 'App preview' }, cta: 'Get started' },
  // Muted looping video (mp4/HLS).
  { id: 'demo', type: 'video', title: 'See it in action', uri: 'https://example.com/demo.mp4' },
  // Single choice (saved as a string).
  { id: 'goal', type: 'select', title: 'What is your goal?', answerKey: 'goal', options: [{ value: 'a', label: 'Option A', detail: 'Optional detail' }, { value: 'b', label: 'Option B' }] },
  // Multi choice (saved as string[]).
  { id: 'topics', type: 'select', multiple: true, title: 'Pick all that apply', answerKey: 'topics', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  // Free text.
  { id: 'name', type: 'text', title: 'Your name?', answerKey: 'firstName', placeholder: 'First name', optional: true },
  // Number range.
  { id: 'minutes', type: 'slider', title: 'Minutes per day?', answerKey: 'minutes', minimum: 5, maximum: 60, initial: 15, unit: ' min' },
  // Date or time (saved as an ISO string).
  { id: 'birthday', type: 'date', title: 'When is your birthday?', answerKey: 'birthday', mode: 'date' },
  { id: 'wake', type: 'date', title: 'When do you wake up?', answerKey: 'wakeTime', mode: 'time' },
  // Social proof.
  { id: 'proof', type: 'testimonial', title: 'Loved by thousands', quote: 'Changed my mornings.', author: 'Sam, 34' },
  // Native review prompt (iOS decides whether it shows).
  { id: 'rate', type: 'rating', title: 'Enjoying it so far?', body: 'A quick rating helps a lot.', skipLabel: 'common.notNow' },
  // ATT. The only path that starts AppsFlyer. Put it before the paywall.
  { id: 'tracking', type: 'permission', permission: 'tracking', title: 'Help us improve', body: 'Allow anonymous attribution.' },
  // Notifications. Enables the daily reminder when granted.
  { id: 'notifications', type: 'permission', permission: 'notifications', title: 'Stay on track', allowLabel: 'Allow', skipLabel: 'common.notNow' },
  // Fake "building your plan" pause; auto-advances.
  { id: 'loading', type: 'loading', title: 'Building your plan…', durationMs: 1500 },
  // "Your plan is ready" chart.
  { id: 'chart', type: 'chart', title: 'Your plan is ready', values: [0.2, 0.35, 0.55, 0.8, 1], startLabel: 'Today', endLabel: 'Week 4' },
  // RevenueCat paywall (soft; dismissing continues to sign-in).
  { id: 'paywall', type: 'paywall', title: 'Start your free trial', body: 'Cancel anytime.' },
];
