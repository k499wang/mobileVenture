import { Platform } from 'react-native';
import { AppsFlyer } from 'react-native-appsflyer';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { env, serviceStatus } from '@/config/env';
import { reportError } from './errors';
import { useDeepLinkStore } from '@/store/deep-link-store';
import { withTimeout } from '@/lib/async';

let initialization: Promise<void> | undefined;
let requested = false;
// Call while the app is active, after the native splash has closed.
export function initializeAttribution() {
  if (!serviceStatus.appsFlyer) return Promise.resolve();
  initialization ??= start().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
async function start() {
  if (Platform.OS === 'ios' && !requested) {
    const permission = await getTrackingPermissionsAsync();
    if (permission.status === 'undetermined') await requestTrackingPermissionsAsync();
    requested = true;
  }
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
  // Startup owns permission timing. Account hydration must not request ATT under the splash.
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
    await AppsFlyer.logEvent({ eventName: event, eventValues: {} });
  } catch (error) { reportError(error, 'attribution.event'); }
}
