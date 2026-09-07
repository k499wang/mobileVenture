/* eslint-disable @typescript-eslint/no-require-imports -- reload singleton services between tests */
import { beforeEach, expect, jest, test } from '@jest/globals';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(), setLogLevel: jest.fn(), addCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(), isAnonymous: jest.fn<() => Promise<unknown>>().mockResolvedValue(true),
    logIn: jest.fn<() => Promise<unknown>>().mockResolvedValue({}), logOut: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    setAttributes: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined), setAppsflyerID: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    collectDeviceIdentifiers: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined), getAppUserID: jest.fn<() => Promise<unknown>>().mockResolvedValue('anonymous-id'),
    getCurrentOfferingForPlacement: jest.fn<() => Promise<unknown>>().mockResolvedValue({ identifier: 'default' }),
    restorePurchases: jest.fn(),
  }, LOG_LEVEL: { DEBUG: 'debug' },
}));
jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: { presentPaywallIfNeeded: jest.fn(), presentCustomerCenter: jest.fn() },
  PAYWALL_RESULT: { PURCHASED: 'PURCHASED', RESTORED: 'RESTORED', CANCELLED: 'CANCELLED', ERROR: 'ERROR', NOT_PRESENTED: 'NOT_PRESENTED' },
}));
jest.mock('@/config/env', () => ({
  env: { revenueCatEntitlementId: 'pro' }, revenueCatApiKey: 'appl_test', serviceStatus: { revenueCat: true },
}));
jest.mock('@/lib/supabase', () => ({ supabase: null }));
jest.mock('./analytics', () => ({ getAnalyticsId: jest.fn<() => Promise<unknown>>().mockResolvedValue('posthog-id'), identifyAnalytics: jest.fn(), resetAnalytics: jest.fn(), trackEvent: jest.fn() }));
jest.mock('./attribution', () => ({ getAttributionId: jest.fn<() => Promise<unknown>>().mockResolvedValue('af-id'), identifyAttribution: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined) }));
jest.mock('./errors', () => ({ reportError: jest.fn() }));

const info = (active: boolean) => ({ entitlements: { active: active ? { pro: {} } : {} } });
function setup() {
  const sdk = require('react-native-purchases').default;
  const ui = require('react-native-purchases-ui').default;
  const billing = require('./purchases') as typeof import('./purchases');
  const store = require('@/store/app-store').useAppStore as typeof import('@/store/app-store').useAppStore;
  const analytics = require('./analytics');
  sdk.getCustomerInfo.mockResolvedValue(info(false));
  ui.presentPaywallIfNeeded.mockResolvedValue('CANCELLED');
  return { sdk, ui, billing, store, analytics };
}
beforeEach(() => { jest.resetModules(); });

test('a failed initial entitlement fetch can recover without configuring twice', async () => {
  const { sdk, billing, store } = setup();
  sdk.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
  await expect(billing.initializePurchases()).rejects.toThrow('offline');
  expect(store.getState().entitlementStatus).toBe('error');
  await billing.initializePurchases();
  expect(store.getState().entitlementStatus).toBe('ready');
  expect(sdk.configure).toHaveBeenCalledTimes(1);
  expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
});

test('an existing subscriber never sees a paywall or generates a paywall request', async () => {
  const { sdk, ui, billing, analytics } = setup();
  sdk.getCustomerInfo.mockResolvedValue(info(true));
  await expect(billing.presentPaywall()).resolves.toBe('already-active');
  expect(ui.presentPaywallIfNeeded).not.toHaveBeenCalled();
  expect(analytics.trackEvent).not.toHaveBeenCalled();
});

test('cancellation does not grant access', async () => {
  const { billing, store, analytics } = setup();
  await expect(billing.presentPaywall('onboarding')).resolves.toBe('cancelled');
  expect(store.getState().isPro).toBe(false);
  expect(analytics.trackEvent.mock.calls.map((call: unknown[]) => call[0])).toEqual(['paywall_requested', 'paywall_result']);
});

test('identifiers are attached before presenting a purchase UI', async () => {
  const { sdk, ui, billing } = setup();
  await billing.presentPaywall();
  expect(sdk.setAppsflyerID).toHaveBeenCalledWith('af-id');
  expect(sdk.setAttributes).toHaveBeenCalledWith({ $posthogUserId: 'posthog-id' });
  expect(sdk.setAppsflyerID.mock.invocationCallOrder[0]).toBeLessThan(ui.presentPaywallIfNeeded.mock.invocationCallOrder[0]);
});

test('optional attribution failure does not prevent opening the paywall', async () => {
  const { ui, billing } = setup();
  require('./attribution').getAttributionId.mockRejectedValue(new Error('unavailable'));
  await expect(billing.presentPaywall()).resolves.toBe('cancelled');
  expect(ui.presentPaywallIfNeeded).toHaveBeenCalledTimes(1);
});

test('restore updates access from RevenueCat', async () => {
  const { sdk, billing, store } = setup();
  sdk.restorePurchases.mockResolvedValue(info(true));
  await expect(billing.restorePurchases()).resolves.toBe(true);
  expect(store.getState().isPro).toBe(true);
});

test('account switching clears the previous entitlement immediately and applies the new user', async () => {
  const { sdk, billing, store } = setup();
  sdk.getCustomerInfo.mockResolvedValueOnce(info(true));
  await billing.initializePurchases();
  const change = billing.setPurchaseUser('user-b');
  expect(store.getState().isPro).toBe(false);
  expect(store.getState().entitlementStatus).toBe('unknown');
  await change;
  expect(sdk.logIn).toHaveBeenCalledWith('user-b');
  expect(store.getState().isPro).toBe(false);
});

test('initial anonymous auth notification does not reset the persisted analytics identity', async () => {
  const { billing, analytics } = setup();
  await billing.setPurchaseUser(null);
  expect(analytics.resetAnalytics).not.toHaveBeenCalled();
});

test('a native presentation error rejects and releases the operation queue', async () => {
  const { ui, billing, store } = setup();
  ui.presentPaywallIfNeeded.mockResolvedValueOnce('ERROR');
  await expect(billing.presentPaywall()).rejects.toThrow('could not be opened');
  expect(store.getState().billingBusy).toBe(false);
  await expect(billing.presentPaywall()).resolves.toBe('cancelled');
});

test('simultaneous startup and paywall requests configure RevenueCat once', async () => {
  const { sdk, billing } = setup();
  await Promise.all([billing.initializePurchases(), billing.presentPaywall()]);
  expect(sdk.configure).toHaveBeenCalledTimes(1);
});

test('an in-flight previous-account refresh cannot restore old access after a switch is requested', async () => {
  const { sdk, billing, store } = setup();
  await billing.initializePurchases();
  let resolveOld!: (value: unknown) => void;
  let signalRead!: () => void;
  const reading = new Promise<void>(resolve => { signalRead = resolve; });
  sdk.getCustomerInfo.mockImplementationOnce(() => {
    signalRead();
    return new Promise(resolve => { resolveOld = resolve; });
  });
  const oldRefresh = billing.refreshPurchases();
  await reading;
  const change = billing.setPurchaseUser('new-user');
  resolveOld(info(true));
  await oldRefresh;
  expect(store.getState().isPro).toBe(false);
  await change;
  expect(store.getState().isPro).toBe(false);
});

test('repeated paywall actions share one native presentation', async () => {
  const { ui, billing } = setup();
  await Promise.all([billing.presentPaywall(), billing.presentPaywall()]);
  expect(ui.presentPaywallIfNeeded).toHaveBeenCalledTimes(1);
});

test('a successful purchase refreshes and grants the configured entitlement', async () => {
  const { sdk, ui, billing, store } = setup();
  sdk.getCustomerInfo.mockResolvedValueOnce(info(false)).mockResolvedValueOnce(info(true));
  ui.presentPaywallIfNeeded.mockResolvedValueOnce('PURCHASED');
  await expect(billing.presentPaywall()).resolves.toBe('purchased');
  expect(store.getState().isPro).toBe(true);
});

test('a purchase result alone cannot grant an entitlement', async () => {
  const { ui, billing, store } = setup();
  ui.presentPaywallIfNeeded.mockResolvedValueOnce('PURCHASED');
  await expect(billing.presentPaywall()).rejects.toThrow('has not been confirmed');
  expect(store.getState().isPro).toBe(false);
});
