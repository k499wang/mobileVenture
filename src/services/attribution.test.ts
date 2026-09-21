/* eslint-disable @typescript-eslint/no-require-imports -- isolate SDK startup state */
import { beforeEach, expect, jest, test } from '@jest/globals';

jest.mock('@/config/env', () => ({ env: { appsFlyerDevKey: 'dev-key', appsFlyerAppId: '123' }, serviceStatus: { appsFlyer: true } }));
jest.mock('./errors', () => ({ reportError: jest.fn() }));
jest.mock('expo-tracking-transparency', () => ({
  getTrackingPermissionsAsync: jest.fn<() => Promise<unknown>>().mockResolvedValue({ status: 'denied' }),
  requestTrackingPermissionsAsync: jest.fn<() => Promise<unknown>>().mockResolvedValue({ status: 'denied' }),
}));
jest.mock('react-native-appsflyer', () => ({ AppsFlyer: {
  registerDeepLinkListener: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  registerSessionReadyListener: jest.fn((callback: () => void) => callback()),
  start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getAppsFlyerUID: jest.fn<() => Promise<string>>().mockResolvedValue('install-id'),
} }));
beforeEach(() => { jest.resetModules(); });

test('identity lookup before splash completion does not request ATT or start attribution', async () => {
  const service = require('./attribution') as typeof import('./attribution');
  await expect(service.getAttributionId()).resolves.toBeUndefined();
  expect(require('react-native-appsflyer').AppsFlyer.init).not.toHaveBeenCalled();
});

test('attribution does not start until the explicit tracking action handles ATT', async () => {
  const service = require('./attribution') as typeof import('./attribution');
  const sdk = require('react-native-appsflyer').AppsFlyer;
  await service.initializeAttribution();
  expect(sdk.init).not.toHaveBeenCalled();
  await service.requestTrackingConsent();
  expect(sdk.registerDeepLinkListener.mock.invocationCallOrder[0]).toBeLessThan(sdk.init.mock.invocationCallOrder[0]);
  expect(sdk.start).toHaveBeenCalledTimes(1);
  await expect(service.getAttributionId()).resolves.toBe('install-id');
});

test('concurrent startup requests share initialization and a failure can retry', async () => {
  const service = require('./attribution') as typeof import('./attribution');
  const sdk = require('react-native-appsflyer').AppsFlyer;
  sdk.init.mockRejectedValueOnce(new Error('native failure'));
  await expect(service.requestTrackingConsent()).rejects.toThrow('native failure');
  await Promise.all([service.initializeAttribution(), service.initializeAttribution()]);
  expect(sdk.init).toHaveBeenCalledTimes(2);
});
