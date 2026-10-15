import type { AppDefinition } from '@/config/app-definition-types';

/**
 * Per-app control panel. Styling lives in src/theme/theme.ts; copy may be plain
 * text or a key from src/i18n/en.ts. See onboarding-examples.ts for every step kind.
 */
export const appDefinition = {
  id: '__APP_SLUG__',
  name: '__APP_NAME__',
  /** Bump to show onboarding again to existing users after changing a shipped flow. */
  onboardingVersion: 1,
  links: { privacy: '', terms: '', supportEmail: '' },
  appStoreId: '',
  auth: { required: true },
  subscription: { entitlementId: 'pro', offeringPlacement: 'default' },
  reminders: { enabled: true, hour: 19, minute: 0, title: 'A moment for you', body: 'Your daily check-in is ready.' },

  /** Add a tab: add an entry here and a matching file in src/app/(tabs)/. */
  tabs: [
    { name: 'index', title: 'tabs.home', icon: { default: 'house', selected: 'house.fill' } },
    { name: 'settings', title: 'tabs.settings', icon: { default: 'gearshape', selected: 'gearshape.fill' } },
  ],

  /** Add, remove, or reorder steps. They run top to bottom; `when` skips a step conditionally. */
  onboarding: [
    { id: 'welcome', type: 'info', mascot: 'wave', title: 'Make space for what matters', body: 'A small daily practice, built around you.', cta: 'Get started' },
    { id: 'goal', type: 'select', title: 'What brings you here?', body: 'We will tailor your starting point.', answerKey: 'goal', options: [{ value: 'focus', label: 'More focus' }, { value: 'calm', label: 'More calm' }, { value: 'routine', label: 'A better routine' }] },
    { id: 'interests', type: 'select', multiple: true, title: 'Choose anything that sounds useful', body: 'Select all that apply.', answerKey: 'interests', options: [{ value: 'habits', label: 'Building habits' }, { value: 'clarity', label: 'Feeling clear-headed' }, { value: 'energy', label: 'Protecting my energy' }] },
    { id: 'name', type: 'text', title: 'What should we call you?', answerKey: 'firstName', placeholder: 'Your first name', optional: true },
    { id: 'frequency', type: 'slider', title: 'How many days a week feels realistic?', body: 'You can adjust this anytime.', answerKey: 'daysPerWeek', minimum: 1, maximum: 7, initial: 3, unit: ' days' },
    { id: 'proof', type: 'testimonial', mascot: 'heart', title: 'Small steps add up', quote: 'It finally feels like a routine I can keep.', author: 'Early member' },
    { id: 'tracking', type: 'permission', permission: 'tracking', title: 'Help us understand what works', body: 'Allow anonymous attribution so we can measure which campaigns bring people here.', allowLabel: 'Continue' },
    { id: 'notifications', type: 'permission', permission: 'notifications', title: 'Keep the streak gentle', body: 'A daily reminder can help you return when you are ready.', allowLabel: 'Allow reminders', skipLabel: 'common.notNow' },
    { id: 'plan', type: 'loading', title: 'Building your plan, {{answers.firstName}}', body: 'Starting with {{answers.daysPerWeek}} days each week.', durationMs: 1300 },
    { id: 'ready', type: 'chart', mascot: 'cheer', title: 'Your plan is ready', body: 'Most people feel the difference within 3 weeks.', startLabel: 'Today', endLabel: 'Week 4' },
    { id: 'paywall', type: 'paywall', title: 'Start your free trial', body: 'Cancel anytime.' },
  ],
} satisfies AppDefinition;
