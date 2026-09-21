import type { AppDefinition } from '@/config/app-definition-types';

export const appDefinition = {
  id: '__APP_SLUG__',
  name: '__APP_NAME__',
  onboardingVersion: 1,
  brand: { primary: '#__BRAND_COLOR__', appearance: 'system' },
  links: { privacy: '', terms: '', support: '' },
  subscription: { entitlementId: 'pro', offeringPlacement: 'default' },
  reminders: { enabled: true, hour: 19, minute: 0, title: 'A moment for you', body: 'Your daily check-in is ready.' },
  onboarding: [
    { id: 'welcome', type: 'info', title: 'Make space for what matters', body: 'A small daily practice, built around you.', cta: 'Get started' },
    { id: 'tracking', type: 'permission', permission: 'tracking', title: 'Help us understand what works', body: 'Allow anonymous attribution so we can measure which campaigns bring people here.', allowLabel: 'Continue' },
    { id: 'goal', type: 'select', title: 'What brings you here?', body: 'We will tailor your starting point.', answerKey: 'goal', options: [{ value: 'focus', label: 'More focus' }, { value: 'calm', label: 'More calm' }, { value: 'routine', label: 'A better routine' }] },
    { id: 'interests', type: 'select', multiple: true, title: 'Choose anything that sounds useful', body: 'Select all that apply.', answerKey: 'interests', options: [{ value: 'habits', label: 'Building habits' }, { value: 'clarity', label: 'Feeling clear-headed' }, { value: 'energy', label: 'Protecting my energy' }] },
    { id: 'name', type: 'text', title: 'What should we call you?', answerKey: 'firstName', placeholder: 'Your first name', optional: true },
    { id: 'frequency', type: 'slider', title: 'How many days a week feels realistic?', body: 'You can adjust this anytime.', answerKey: 'daysPerWeek', minimum: 1, maximum: 7, initial: 3, unit: ' days' },
    { id: 'notifications', type: 'permission', permission: 'notifications', when: { answer: 'goal', equals: 'routine' }, title: 'Keep the streak gentle', body: 'A daily reminder can help you return when you are ready.', allowLabel: 'Allow reminders', skipLabel: 'Not now' },
    { id: 'proof', type: 'testimonial', title: 'Small steps add up', quote: 'It finally feels like a routine I can keep.', author: 'Early member' },
    { id: 'plan', type: 'loading', title: 'Building your plan, {{answers.firstName}}', body: 'Starting with {{answers.daysPerWeek}} days each week.', durationMs: 1300 },
    { id: 'paywall', type: 'paywall', title: 'Start your free trial', body: 'Cancel anytime. Your plans and prices are shown next.' },
  ],
} satisfies AppDefinition;
