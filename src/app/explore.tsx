import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthCard } from '@/components/auth-card';
import { GlassButton, GlassCard, GlassHeader, useGlassPalette } from '@/components/glass';
import { appDefinition } from '@/config/app-definition';
import { envItems, serviceStatus } from '@/config/env';
import { useAuthSession } from '@/hooks/use-auth-session';
import { deleteCurrentAccount } from '@/services/auth';
import { manageSubscription, restorePurchases } from '@/services/purchases';
import { isDailyReminderEnabled, setDailyReminderEnabled } from '@/services/reminders';
import { requestReviewAfterSuccess } from '@/services/review';
import { useAppStore } from '@/store/app-store';

export default function SettingsScreen() {
  const palette = useGlassPalette();
  const [working, setWorking] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const billingBusy = useAppStore(state => state.billingBusy);
  const { session } = useAuthSession();
  useEffect(() => { void isDailyReminderEnabled().then(setRemindersOn); }, []);
  async function run(action: () => Promise<unknown>, success?: string) {
    setWorking(true);
    try { await action(); if (success) Alert.alert(success); }
    catch (error) { Alert.alert('Unable to complete request', error instanceof Error ? error.message : 'Please try again in a moment.'); }
    finally { setWorking(false); }
  }
  function confirmDeletion() {
    Alert.alert('Delete account?', 'This permanently removes your account and cloud data. Active subscriptions must be cancelled separately in the App Store.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void run(deleteCurrentAccount, 'Your account has been deleted.') },
    ]);
  }
  const legalLinks = [['Privacy policy', appDefinition.links.privacy], ['Terms of use', appDefinition.links.terms], ['Contact support', appDefinition.links.support]] as const;
  return <ScrollView style={[styles.page, { backgroundColor: palette.page }]} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic"><SafeAreaView edges={['left', 'right']}>
    <GlassHeader title="Settings" />
    <View style={styles.stack}>
      <AuthCard color={appDefinition.brand.primary} />
      <GlassCard style={styles.card}><Text style={[styles.title, { color: palette.text }]}>Subscription</Text><Text style={[styles.copy, { color: palette.muted }]}>Restore purchases if you previously subscribed with this Apple ID or Google account.</Text><GlassButton color={appDefinition.brand.primary} disabled={working || billingBusy || !serviceStatus.revenueCat} onPress={() => void run(async () => { const active = await restorePurchases(); Alert.alert(active ? 'Purchases restored' : 'No active subscription found'); })}><Text style={styles.button}>Restore purchases</Text></GlassButton><GlassButton color="#44444D" disabled={working || billingBusy || !serviceStatus.revenueCat} onPress={() => void run(manageSubscription)}><Text style={styles.button}>Manage subscription</Text></GlassButton></GlassCard>
      {appDefinition.reminders.enabled ? <GlassCard style={styles.card}><Text style={[styles.title, { color: palette.text }]}>Daily reminder</Text><Text style={[styles.copy, { color: palette.muted }]}>{remindersOn ? `Scheduled for ${formatReminderTime()}.` : 'Get a gentle daily reminder when notifications are enabled.'}</Text><GlassButton color={appDefinition.brand.primary} disabled={working} onPress={() => void run(async () => { const enabled = await setDailyReminderEnabled(!remindersOn); setRemindersOn(enabled); if (!enabled && !remindersOn) Alert.alert('Notifications are off', 'You can enable them later in your device settings.'); })}><Text style={styles.button}>{remindersOn ? 'Turn off reminder' : 'Turn on reminder'}</Text></GlassButton></GlassCard> : null}
      <GlassCard style={styles.card}><Text style={[styles.title, { color: palette.text }]}>Help and feedback</Text><GlassButton color="#44444D" disabled={working} onPress={() => void run(async () => { const shown = await requestReviewAfterSuccess(); if (!shown) Alert.alert('Thanks for your feedback', 'A review prompt is not available right now.'); })}><Text style={styles.button}>Rate this app</Text></GlassButton>{legalLinks.map(([label, url]) => <GlassButton key={label} color="#44444D" disabled={working || !url} onPress={() => void run(() => Linking.openURL(url))}><Text style={styles.button}>{url ? label : `${label} not configured`}</Text></GlassButton>)}</GlassCard>
      {session ? <GlassCard style={styles.danger}><Text style={[styles.title, { color: palette.text }]}>Danger zone</Text><Text style={[styles.copy, { color: palette.muted }]}>Delete your account and associated cloud data. This cannot be undone.</Text><GlassButton color="#B42318" disabled={working} onPress={confirmDeletion}><Text style={styles.button}>Delete account</Text></GlassButton></GlassCard> : null}
      {__DEV__ ? <GlassCard style={styles.card}><Text style={[styles.title, { color: palette.text }]}>Development configuration</Text>{envItems.map(item => <Text key={item.name} style={[styles.copy, { color: palette.muted }]}>{item.label}: {item.configured ? 'Configured' : 'Disabled'}</Text>)}</GlassCard> : null}
    </View>
  </SafeAreaView></ScrollView>;
}

function formatReminderTime() { const { hour, minute } = appDefinition.reminders; return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F7FB' }, content: { padding: 24, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' }, stack: { gap: 18, marginTop: 24 }, card: { gap: 13 }, danger: { gap: 13, borderColor: '#FECACA' }, title: { color: '#19191F', fontSize: 19, fontWeight: '700' }, copy: { color: '#686875', fontSize: 14, lineHeight: 20 }, button: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 } });
