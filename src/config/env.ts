import { Platform } from 'react-native';
import { appConfig } from './app';

export function configured(value: string | undefined): value is string {
  return Boolean(value?.trim() && !/your-|placeholder/i.test(value));
}

// Expo only inlines direct EXPO_PUBLIC accesses. These are public SDK keys, never server secrets.
export const env = {
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  appsFlyerDevKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY,
  appsFlyerAppId: process.env.EXPO_PUBLIC_APPSFLYER_APP_ID,
  revenueCatIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  revenueCatAndroidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  revenueCatEntitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? appConfig.entitlementId,
  supabaseDeleteAccountFunction: process.env.EXPO_PUBLIC_SUPABASE_DELETE_ACCOUNT_FUNCTION ?? 'delete-account',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
};
export const revenueCatApiKey = Platform.select({ ios: env.revenueCatIosApiKey, android: env.revenueCatAndroidApiKey });
const native = Platform.OS === 'ios' || Platform.OS === 'android';
export const serviceStatus = {
  supabase: configured(env.supabaseUrl) && configured(env.supabasePublishableKey),
  posthog: native && configured(env.posthogApiKey),
  appsFlyer: native && configured(env.appsFlyerDevKey) && (Platform.OS !== 'ios' || configured(env.appsFlyerAppId)),
  revenueCat: native && configured(revenueCatApiKey),
  sentry: configured(env.sentryDsn),
};
export const envItems = Object.entries(serviceStatus).map(([label, configured]) => ({
  label, name: label, configured,
}));
