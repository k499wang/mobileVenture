/**
 * English is the source of truth. Keys are flat strings; `{{name}}` is a parameter.
 * Add a language: copy this file to e.g. `es.ts` typed as `Translations`, then register it in `index.ts`.
 * Onboarding copy in app-definition.ts may use a key from here or a plain string.
 */
export const en = {
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.notNow': 'Not now',
  'common.tryAgain': 'Please try again in a moment.',
  'common.error': 'Unable to complete request',

  'tabs.home': 'Home',
  'tabs.settings': 'Settings',

  'auth.title': 'Create your account',
  'auth.body': 'Save your progress and subscription across devices.',
  'auth.apple': 'Continue with Apple',
  'auth.google': 'Continue with Google',
  'auth.legal': 'By continuing you agree to our Terms and Privacy Policy.',
  'auth.notConfigured': 'Sign-in needs Supabase keys in .env. Development builds can continue without an account.',
  'auth.skipDev': 'Continue without account (dev only)',

  'paywall.unavailable': 'Subscriptions are unavailable',
  'pro.locked': 'This is a Pro feature',
  'pro.unlock': 'Unlock Pro',

  'onboarding.permissionHint': 'You can always change this later in Settings.',
  'onboarding.paywallHint': 'Plans and prices are shown next.',
  'onboarding.rateCta': 'Rate us',

  'home.eyebrow': 'YOUR CORE FEATURE',
  'home.title': 'Build this screen for each app.',
  'home.body': 'Onboarding, subscriptions, sign-in, analytics, attribution, reminders and settings are already wired up.',
  'home.featureTitle': 'Feature placeholder',
  'home.featureBody': 'Replace this card with the one thing people open your app to do.',
  'home.featureCta': 'Complete example action',
  'home.proTitle': 'Pro example',
  'home.proBody': 'This action is gated with requirePro(); free users see the paywall.',
  'home.proCta': 'Run Pro action',
  'home.done': 'Nice work',

  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.signedInAs': 'Signed in as {{email}}',
  'settings.signOut': 'Sign out',
  'settings.deleteAccount': 'Delete account',
  'settings.deleteTitle': 'Delete account?',
  'settings.deleteBody': 'This permanently removes your account and cloud data. Active subscriptions must be cancelled separately in the App Store.',
  'settings.deleted': 'Your account has been deleted.',
  'settings.subscription': 'Subscription',
  'settings.status': 'Status',
  'settings.pro': 'Pro',
  'settings.free': 'Free',
  'settings.upgrade': 'Upgrade to Pro',
  'settings.manage': 'Manage subscription',
  'settings.restore': 'Restore purchases',
  'settings.restored': 'Purchases restored',
  'settings.noneRestored': 'No active subscription found',
  'settings.reminders': 'Reminders',
  'settings.dailyReminder': 'Daily reminder',
  'settings.reminderTime': 'Time',
  'settings.notificationsOff': 'Notifications are off. You can enable them in iOS Settings.',
  'settings.support': 'Support',
  'settings.contact': 'Contact support',
  'settings.rate': 'Rate the app',
  'settings.share': 'Share the app',
  'settings.shareMessage': 'Check out {{app}}',
  'settings.legal': 'Legal',
  'settings.terms': 'Terms of use',
  'settings.privacy': 'Privacy policy',
  'settings.version': 'Version {{version}}',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Partial<Record<TranslationKey, string>>;
