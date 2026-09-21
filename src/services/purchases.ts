import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { env, revenueCatApiKey, serviceStatus } from '@/config/env';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { createQueue, withTimeout } from '@/lib/async';
import { getAnalyticsId, identifyAnalytics, resetAnalytics, trackEvent } from './analytics';
import { getAttributionId, identifyAttribution } from './attribution';
import { reportError } from './errors';

const enqueue = createQueue();
let configured = false;
let desiredUserId: string | null | undefined;
let analyticsUserId: string | null = null;
let appliedUserId: string | null | undefined;
let pendingIdentities = 0;
let readingCustomerInfo = false;
function updateEntitlement(info: CustomerInfo) {
  if (pendingIdentities === 0) useAppStore.getState().setIsPro(Boolean(info.entitlements.active[env.revenueCatEntitlementId]));
}
function operation<T>(work: () => Promise<T>) {
  return enqueue(async () => {
    useAppStore.setState({ billingBusy: true });
    try { return await work(); }
    catch (error) { reportError(error, 'billing.operation'); throw error; }
    finally { useAppStore.setState({ billingBusy: false }); }
  });
}
async function ensureConfigured() {
  if (!serviceStatus.revenueCat) throw new Error('Purchases are unavailable on this platform.');
  if (configured) return;
  if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: revenueCatApiKey! });
  configured = true;
  Purchases.addCustomerInfoUpdateListener(() => {
    // Read fresh data through the queue rather than applying a previous account's callback.
    if (!readingCustomerInfo) void refreshPurchases().catch(() => undefined);
  });
}
async function applyIdentity() {
  await ensureConfigured();
  if (desiredUserId === undefined) {
    const result = await supabase?.auth.getSession();
    if (result?.error) throw result.error;
    desiredUserId = result?.data.session?.user.id ?? null;
    if (desiredUserId) identifyAnalytics(desiredUserId);
    analyticsUserId = desiredUserId;
  }
  if (appliedUserId === desiredUserId) return;
  useAppStore.getState().reset();
  if (desiredUserId) await Purchases.logIn(desiredUserId);
  else if (!(await Purchases.isAnonymous())) {
    await Purchases.logOut();
    resetAnalytics();
  }
  appliedUserId = desiredUserId;
}
async function refresh() {
  if (!serviceStatus.revenueCat) {
    useAppStore.setState({ entitlementStatus: 'disabled' });
    return;
  }
  try {
    await applyIdentity();
    if (useAppStore.getState().entitlementStatus !== 'ready') useAppStore.setState({ entitlementStatus: 'loading' });
    readingCustomerInfo = true;
    try { updateEntitlement(await Purchases.getCustomerInfo()); }
    finally { readingCustomerInfo = false; }
  } catch (error) {
    useAppStore.setState({ entitlementStatus: 'error' });
    throw error;
  }
}
export function initializePurchases() { return operation(refresh); }
export function refreshPurchases() { return operation(refresh); }

/** Optional integrations must not block billing indefinitely. Retry at startup/foreground/paywall. */
async function syncIdentifiers() {
  // Only reads have deadlines. Attribute writes stay inside the billing queue so they
  // cannot arrive after a later logIn/logOut and attach to a different customer.
  try {
    const posthogId = await withTimeout(getAnalyticsId(), 3000, 'Analytics identity');
    if (posthogId) await Purchases.setAttributes({ $posthogUserId: posthogId });
  } catch (error) { reportError(error, 'billing.posthog-identity'); }
  try {
    const appsflyerId = await withTimeout(getAttributionId(), 5000, 'Attribution identity');
    if (appsflyerId) {
      await Purchases.setAppsflyerID(appsflyerId);
      await Purchases.collectDeviceIdentifiers();
      await identifyAttribution(await Purchases.getAppUserID());
    }
  } catch (error) { reportError(error, 'billing.appsflyer-identity'); }
}

export function syncPurchaseIdentifiers() {
  return operation(async () => { if (serviceStatus.revenueCat) { await applyIdentity(); await syncIdentifiers(); } });
}
/** Call from the auth lifecycle, not directly from UI login buttons. */
export function setPurchaseUser(userId: string | null) {
  pendingIdentities++;
  useAppStore.getState().reset();
  return operation(async () => {
    pendingIdentities--;
    desiredUserId = userId;
    if (analyticsUserId && analyticsUserId !== userId) resetAnalytics();
    if (userId) identifyAnalytics(userId);
    analyticsUserId = userId;
    await refresh();
    if (serviceStatus.revenueCat) await syncIdentifiers();
  });
}
export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'already-active';
let paywallInFlight: Promise<PaywallOutcome> | undefined;
export function presentPaywall(placement = 'default'): Promise<PaywallOutcome> {
  paywallInFlight ??= operation<PaywallOutcome>(async () => {
    await applyIdentity();
    await refresh();
    if (useAppStore.getState().isPro) return 'already-active';
    await syncIdentifiers();
    if (pendingIdentities) throw new Error('Your account is changing. Please try again.');
    trackEvent('paywall_requested', { placement });
    const offering = await Purchases.getCurrentOfferingForPlacement(placement);
    if (!offering) throw new Error('No subscription is available right now. Please try again later.');
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: env.revenueCatEntitlementId, offering, displayCloseButton: true,
    });
    trackEvent('paywall_result', { placement, result });
    if (result === PAYWALL_RESULT.ERROR) throw new Error('The paywall could not be opened. Please try again.');
    await refresh();
    if (pendingIdentities) throw new Error('Your account is changing. Please check access after it finishes.');
    if ((result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || result === PAYWALL_RESULT.NOT_PRESENTED) && !useAppStore.getState().isPro) {
      throw new Error('Subscription access has not been confirmed yet. Please restore purchases or try again shortly.');
    }
    if (result === PAYWALL_RESULT.PURCHASED) {
      const entitlement = (await Purchases.getCustomerInfo()).entitlements.active[env.revenueCatEntitlementId];
      const periodType = String(entitlement?.periodType ?? 'UNKNOWN');
      trackEvent('purchase_completed', { placement, periodType });
      if (periodType.toUpperCase() === 'TRIAL') trackEvent('trial_started', { placement });
      return 'purchased';
    }
    if (result === PAYWALL_RESULT.RESTORED) return 'restored';
    if (result === PAYWALL_RESULT.NOT_PRESENTED) return 'already-active';
    return 'cancelled';
  }).finally(() => { paywallInFlight = undefined; });
  return paywallInFlight;
}
export function restorePurchases() {
  return operation(async () => {
    await applyIdentity();
    updateEntitlement(await Purchases.restorePurchases());
    const active = useAppStore.getState().isPro;
    trackEvent('restore_completed', { active });
    return active;
  });
}
export function manageSubscription() {
  return operation(async () => {
    await applyIdentity();
    await RevenueCatUI.presentCustomerCenter();
    await refresh();
  });
}
