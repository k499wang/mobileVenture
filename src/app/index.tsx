import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassButton, GlassCard, GlassChip, GlassHeader, useGlassPalette } from '@/components/glass';
import { appDefinition } from '@/config/app-definition';
import { serviceStatus } from '@/config/env';
import { requestReviewAfterSuccess } from '@/services/review';
import { trackEvent } from '@/services/analytics';
import { presentPaywall } from '@/services/purchases';
import { useAppStore } from '@/store/app-store';

/** Replace the contents of this screen per app; the shell and services stay shared. */
export default function HomeScreen() {
  const palette = useGlassPalette();
  const isPro = useAppStore(state => state.isPro);
  const billingBusy = useAppStore(state => state.billingBusy);
  const [working, setWorking] = useState(false);
  async function unlock() {
    setWorking(true);
    try { await presentPaywall(appDefinition.subscription.offeringPlacement); }
    catch (error) { Alert.alert('Subscriptions are unavailable', error instanceof Error ? error.message : 'Try again later.'); }
    finally { setWorking(false); }
  }
  function completeExampleAction() {
    trackEvent('core_action_completed', { action: 'example_completed' });
    void requestReviewAfterSuccess();
    Alert.alert('Nice work', 'This is where your app’s core outcome goes. The event is already tracked.');
  }
  return <ScrollView style={[styles.page, { backgroundColor: palette.page }]} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic"><SafeAreaView edges={['left', 'right']}>
    <GlassHeader title={appDefinition.name} trailing={<GlassChip label={isPro ? 'PRO' : 'FREE'} selected={isPro} />} />
    <View style={styles.hero}><Text style={[styles.eyebrow, { color: palette.muted }]}>YOUR CORE FEATURE</Text><Text style={[styles.title, { color: palette.text }]}>Build this screen for each app.</Text><Text style={[styles.copy, { color: palette.muted }]}>Everything around it—onboarding, subscriptions, identity, analytics, attribution, notifications, and settings—is already shared.</Text></View>
    <GlassCard style={styles.card}><Text style={[styles.cardTitle, { color: palette.text }]}>Feature placeholder</Text><Text style={[styles.copy, { color: palette.muted }]}>Replace this card with the one thing people open your app to do.</Text><GlassButton color={appDefinition.brand.primary} onPress={completeExampleAction}><Text style={styles.button}>Complete example action</Text></GlassButton></GlassCard>
    {!isPro ? <GlassCard style={styles.card}><Text style={[styles.cardTitle, { color: palette.text }]}>Unlock premium</Text><Text style={[styles.copy, { color: palette.muted }]}>Packages, trials, and prices are managed remotely in RevenueCat.</Text><GlassButton color={appDefinition.brand.primary} disabled={!serviceStatus.revenueCat || billingBusy || working} onPress={() => void unlock()}><Text style={styles.button}>{working ? 'Opening…' : serviceStatus.revenueCat ? 'View plans' : 'Subscriptions need configuration'}</Text></GlassButton></GlassCard> : null}
    {__DEV__ ? <Text style={[styles.dev, { color: palette.muted }]}>Factory preview · Edit app-definition.ts for configuration or replace this feature placeholder.</Text> : null}
  </SafeAreaView></ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F7FB' }, content: { padding: 24, paddingBottom: 120, gap: 24, maxWidth: 760, width: '100%', alignSelf: 'center' }, hero: { gap: 12, paddingVertical: 30 }, eyebrow: { color: '#686875', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }, title: { color: '#19191F', fontSize: 35, fontWeight: '800', letterSpacing: -0.8 }, copy: { color: '#686875', fontSize: 16, lineHeight: 23 }, card: { gap: 14 }, cardTitle: { color: '#19191F', fontSize: 19, fontWeight: '700' }, button: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, dev: { color: '#686875', fontSize: 13, textAlign: 'center' } });
