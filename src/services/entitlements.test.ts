import { beforeEach, expect, jest, test } from '@jest/globals';
import { Alert } from 'react-native';

import { presentPaywall } from '@/services/purchases';
import { useAppStore } from '@/store/app-store';
import { requirePro } from './entitlements';

// jest.mock calls are hoisted above the imports.

jest.mock('@/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/services/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/services/errors', () => ({ reportError: jest.fn() }));
jest.mock('@/services/purchases', () => ({ presentPaywall: jest.fn() }));

const paywall = presentPaywall as jest.MockedFunction<typeof presentPaywall>;
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); useAppStore.getState().reset(); });

test('Pro users pass without a paywall', async () => {
  useAppStore.getState().setIsPro(true);
  await expect(requirePro('x')).resolves.toBe(true);
  expect(paywall).not.toHaveBeenCalled();
});

test('a confirmed purchase unlocks', async () => {
  paywall.mockImplementation(async () => { useAppStore.getState().setIsPro(true); return 'purchased'; });
  await expect(requirePro('x')).resolves.toBe(true);
});

test('cancelling keeps the action locked', async () => {
  paywall.mockResolvedValue('cancelled');
  await expect(requirePro('x')).resolves.toBe(false);
});

test('paywall errors are shown and stay locked', async () => {
  paywall.mockRejectedValue(new Error('offline'));
  await expect(requirePro('x')).resolves.toBe(false);
  expect(Alert.alert).toHaveBeenCalled();
});
