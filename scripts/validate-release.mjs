import { execFileSync } from 'node:child_process';

// Expo CLI loads .env using its normal resolution. Never print the resulting config/keys.
process.env.NODE_ENV ??= 'production';
const config = JSON.parse(execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--json'], {
  env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'production' }, encoding: 'utf8',
}));
const errors = [];
const platform = process.env.EAS_BUILD_PLATFORM ?? 'ios';
for (const [name, value] of Object.entries(config.extra?.studio?.links ?? {})) {
  if (!value || !(name === 'support' ? /^(https:\/\/|mailto:)/ : /^https:\/\//).test(value)) errors.push(`Set a valid ${name} URL in src/config/app.json.`);
}
if (!config.ios?.bundleIdentifier || config.ios.bundleIdentifier.includes('example')) errors.push('Set APP_BUNDLE_ID.');
if (!config.android?.package || config.android.package.includes('example')) errors.push('Set APP_ANDROID_PACKAGE.');
if (config.name === 'Starter' || config.slug === 'starter') errors.push('Set APP_NAME and APP_SLUG.');
// Resolve public env through Expo's loader rather than reading secrets into output.
const { load } = await import('@expo/env');
load(process.cwd());
for (const name of [platform === 'android' ? 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY' : 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY', 'EXPO_PUBLIC_APPSFLYER_DEV_KEY', ...(platform === 'ios' ? ['EXPO_PUBLIC_APPSFLYER_APP_ID'] : []), 'EXPO_PUBLIC_POSTHOG_API_KEY', 'EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
  if (!process.env[name]?.trim() || /your-|placeholder/i.test(process.env[name])) errors.push(`Configure ${name}.`);
}
if (process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY && !process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY.startsWith('appl_')) errors.push('Use a RevenueCat Apple public SDK key.');
if (process.env.EXPO_PUBLIC_APPSFLYER_APP_ID && !/^\d+$/.test(process.env.EXPO_PUBLIC_APPSFLYER_APP_ID)) errors.push('AppsFlyer iOS app ID must be numeric.');
if (platform === 'android' && process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY && !process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY.startsWith('goog_')) errors.push('Use a RevenueCat Google public SDK key.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Release identifiers and required platform service configuration are present. Complete docs/launch-checklist.md before release.');
