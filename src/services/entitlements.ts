import { Alert } from 'react-native';

import { appDefinition } from '@/config/app-definition';
import { t } from '@/i18n';
import { trackEvent } from '@/services/analytics';
import { reportError } from '@/services/errors';
import { presentPaywall } from '@/services/purchases';
import { useAppStore } from '@/store/app-store';

/**
 * Gate any premium action in one line:
 *   if (!(await requirePro('export'))) return;
 * Pro users pass immediately. Others see the RevenueCat paywall; resolves true only
 * when RevenueCat confirms the entitlement.
 */
export async function requirePro(feature = 'unknown', placement = appDefinition.subscription.offeringPlacement): Promise<boolean> {
  if (useAppStore.getState().isPro) return true;
  try {
    const outcome = await presentPaywall(placement);
    const unlocked = outcome !== 'cancelled' && useAppStore.getState().isPro;
    trackEvent('pro_gate_shown', { feature, unlocked });
    return unlocked;
  } catch (error) {
    reportError(error, 'entitlements.require-pro');
    Alert.alert(t('paywall.unavailable'), error instanceof Error ? error.message : t('common.tryAgain'));
    return false;
  }
}
