import * as Application from 'expo-application';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform, Share } from 'react-native';
import Purchases from 'react-native-purchases';

import { appDefinition } from '@/config/app-definition';
import { serviceStatus } from '@/config/env';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/services/analytics';

export const appVersion = `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;
const appStoreUrl = appDefinition.appStoreId ? `https://apps.apple.com/app/id${appDefinition.appStoreId}` : null;

/** Opens Mail with app version, iOS version and user/customer IDs prefilled for support. */
export async function contactSupport() {
  if (!appDefinition.links.supportEmail) throw new Error('Set links.supportEmail in app-definition.ts.');
  const userId = (await supabase?.auth.getSession())?.data.session?.user.id ?? 'signed out';
  const customerId = serviceStatus.revenueCat ? await Purchases.getAppUserID().catch(() => 'unavailable') : 'disabled';
  const body = `\n\n—\n${appDefinition.name} ${appVersion}\niOS ${Platform.Version}\nUser: ${userId}\nCustomer: ${customerId}`;
  const url = `mailto:${appDefinition.links.supportEmail}?subject=${encodeURIComponent(`${appDefinition.name} support`)}&body=${encodeURIComponent(body)}`;
  trackEvent('support_contacted', {});
  await Linking.openURL(url);
}

/** Opens the App Store review page when the ID is set; otherwise the in-app prompt. */
export async function rateApp() {
  if (appStoreUrl) { await Linking.openURL(`${appStoreUrl}?action=write-review`); return; }
  if (await StoreReview.hasAction()) await StoreReview.requestReview();
}

export async function shareApp() {
  const result = await Share.share({ message: t('settings.shareMessage', { app: appDefinition.name }), url: appStoreUrl ?? undefined });
  if (result.action === Share.sharedAction) trackEvent('app_shared', {});
}
