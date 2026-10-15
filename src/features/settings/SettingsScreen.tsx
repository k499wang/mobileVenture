import { DatePicker, Host } from '@expo/ui/swift-ui';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { ListRow, Screen, Section, Text } from '@/components/ui';
import { appDefinition } from '@/config/app-definition';
import { envItems, serviceStatus } from '@/config/env';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useEntitlement } from '@/hooks/use-entitlement';
import { t } from '@/i18n';
import { deleteCurrentAccount, signOut } from '@/services/auth';
import { requirePro } from '@/services/entitlements';
import { manageSubscription, restorePurchases } from '@/services/purchases';
import { getReminderSettings, setDailyReminderEnabled, type ReminderSettings } from '@/services/reminders';
import { appVersion, contactSupport, rateApp, shareApp } from '@/services/support';
import { useAppStore } from '@/store/app-store';

/** Generic settings. Restore purchases and Delete account must stay visible (App Store rules). */
export function SettingsScreen() {
  const { session } = useAuthSession();
  const { isPro } = useEntitlement();
  const billingBusy = useAppStore(state => state.billingBusy);
  const [working, setWorking] = useState(false);
  const [reminder, setReminder] = useState<ReminderSettings | null>(null);
  useEffect(() => { void getReminderSettings().then(setReminder); }, []);

  async function run(action: () => Promise<unknown>, success?: string) {
    setWorking(true);
    try { await action(); if (success) Alert.alert(success); }
    catch (error) { Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain')); }
    finally { setWorking(false); }
  }
  function confirmDeletion() {
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.deleteAccount'), style: 'destructive', onPress: () => void run(deleteCurrentAccount, t('settings.deleted')) },
    ]);
  }
  function updateReminder(enabled: boolean, time?: { hour: number; minute: number }) {
    void run(async () => {
      const scheduled = await setDailyReminderEnabled(enabled, time);
      setReminder(await getReminderSettings());
      if (enabled && !scheduled) Alert.alert(t('settings.notificationsOff'));
    });
  }
  const billingDisabled = working || billingBusy || !serviceStatus.revenueCat;
  const openLink = (url: string) => () => void run(() => Linking.openURL(url));

  return <Screen>
    <Text variant="display">{t('settings.title')}</Text>

    <Section title={t('settings.account')}>
      <ListRow title={session ? t('settings.signedInAs', { email: session.user.email ?? session.user.id.slice(0, 8) }) : '—'} />
      <ListRow title={t('settings.signOut')} disabled={working || !session} onPress={() => void run(signOut)} />
      <ListRow title={t('settings.deleteAccount')} destructive disabled={working || !session} onPress={confirmDeletion} last />
    </Section>

    <Section title={t('settings.subscription')}>
      <ListRow title={t('settings.status')} trailing={<Text color={isPro ? 'brand' : 'muted'}>{t(isPro ? 'settings.pro' : 'settings.free')}</Text>} />
      {!isPro ? <ListRow title={t('settings.upgrade')} disabled={billingDisabled} onPress={() => void requirePro('settings_upgrade')} /> : null}
      <ListRow title={t('settings.manage')} disabled={billingDisabled} onPress={() => void run(manageSubscription)} />
      <ListRow title={t('settings.restore')} disabled={billingDisabled} last onPress={() => void run(async () => {
        Alert.alert(t(await restorePurchases() ? 'settings.restored' : 'settings.noneRestored'));
      })} />
    </Section>

    {appDefinition.reminders.enabled && reminder ? <Section title={t('settings.reminders')}>
      <ListRow title={t('settings.dailyReminder')} disabled={working} toggle={{ value: reminder.enabled, onChange: value => updateReminder(value) }} last={!reminder.enabled} />
      {reminder.enabled ? <ListRow title={t('settings.reminderTime')} last trailing={
        <Host matchContents>
          <DatePicker displayedComponents={['hourAndMinute']} selection={new Date(2000, 0, 1, reminder.hour, reminder.minute)}
            onDateChange={date => updateReminder(true, { hour: date.getHours(), minute: date.getMinutes() })} />
        </Host>} /> : null}
    </Section> : null}

    <Section title={t('settings.support')}>
      <ListRow title={t('settings.contact')} disabled={working} onPress={() => void run(contactSupport)} />
      <ListRow title={t('settings.rate')} disabled={working} onPress={() => void run(rateApp)} />
      <ListRow title={t('settings.share')} disabled={working} onPress={() => void run(shareApp)} last />
    </Section>

    <Section title={t('settings.legal')} footer={t('settings.version', { version: appVersion })}>
      <ListRow title={t('settings.terms')} disabled={!appDefinition.links.terms} onPress={openLink(appDefinition.links.terms)} />
      <ListRow title={t('settings.privacy')} disabled={!appDefinition.links.privacy} onPress={openLink(appDefinition.links.privacy)} last />
    </Section>

    {__DEV__ ? <Section title="Development configuration">
      {envItems.map((item, index) => <ListRow key={item.name} title={item.label} detail={item.configured ? 'Configured' : 'Disabled'} last={index === envItems.length - 1} />)}
    </Section> : null}
  </Screen>;
}
