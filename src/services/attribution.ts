import { Platform } from 'react-native';
import { AppsFlyer } from 'react-native-appsflyer';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { env, serviceStatus } from '@/config/env';
import { reportError } from './errors';
import { useDeepLinkStore } from '@/store/deep-link-store';
import { withTimeout } from '@/lib/async';

let initialization: Promise<void> | undefined;
// On iOS, AppsFlyer must never begin before the tracking decision is made by the
// dedicated onboarding/settings action. This intentionally begins false even
// if the operating system has a previously stored ATT choice.
let trackingChoiceHandled = Platform.OS !== 'ios';

/**
 * Start AppsFlyer only after ATT has been handled. Calling this before that is
 * harmless: it deliberately does nothing rather than prompting under splash.
 */
export function initializeAttribution() {
  if (!serviceStatus.appsFlyer) return Promise.resolve();
  if (!trackingChoiceHandled) return Promise.resolve();
  initialization ??= start().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

/** Call only from an explicit tracking-permission UI action while the app is active. */
export async function requestTrackingConsent() {
  if (Platform.OS === 'ios') {
    const permission = await getTrackingPermissionsAsync();
    if (permission.status === 'undetermined') await requestTrackingPermissionsAsync();
  }
  trackingChoiceHandled = true;
  await initializeAttribution();
}

async function start() {
  await AppsFlyer.registerDeepLinkListener({ onDeepLinking: data => {
    if (data.status === 'FOUND') useDeepLinkStore.getState().receive(data.deepLink?.deep_link_value);
  } });
  const init = AppsFlyer.init({ devKey: env.appsFlyerDevKey!, appId: env.appsFlyerAppId });
  const started = new Promise<void>((resolve, reject) => {
    AppsFlyer.registerSessionReadyListener(() => {
      void AppsFlyer.start().then(() => resolve(), reject);
    });
  });
  await withTimeout(Promise.all([init, started]), 15000, 'AppsFlyer startup');
}
export async function getAttributionId() {
  // Account hydration must not prompt or launch attribution under the splash.
  if (!initialization || !serviceStatus.appsFlyer) return undefined;
  await initialization;
  return AppsFlyer.getAppsFlyerUID();
}
export async function identifyAttribution(userId: string) {
  if (!serviceStatus.appsFlyer || !initialization) return;
  await initialization;
  await AppsFlyer.setCustomerUserId({ customerId: userId });
}
/** Non-revenue conversion events only. RevenueCat owns subscription revenue. */
export async function trackAttributionEvent(event: 'af_tutorial_completion' | 'activation_completed') {
  if (!serviceStatus.appsFlyer) return;
  try {
    await initializeAttribution();
    if (!initialization) return;
    await AppsFlyer.logEvent({ eventName: event, eventValues: {} });
  } catch (error) { reportError(error, 'attribution.event'); }
}
