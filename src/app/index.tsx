import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { env, serviceStatus } from '@/config/env';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { presentPaywall } from '@/services/purchases';
import { useAppStore } from '@/store/app-store';

export default function HomeScreen() {
  const theme = useTheme();
  const isPro = useAppStore((state) => state.isPro);
  const status = useAppStore((state) => state.entitlementStatus);
  const billingBusy = useAppStore((state) => state.billingBusy);
  const [isOpeningPaywall, setIsOpeningPaywall] = useState(false);

  async function handlePaywall() {
    setIsOpeningPaywall(true);

    try {
      const unlocked = await presentPaywall();
      if (unlocked === 'purchased' || unlocked === 'restored') Alert.alert('You are Pro', 'Your entitlement is now active.');
    } catch (error) {
      Alert.alert('Paywall unavailable', error instanceof Error ? error.message : 'Try again later.');
    } finally {
      setIsOpeningPaywall(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic">
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: Colors.accent }]}>
            <SymbolView name="sparkles" tintColor="#FFFFFF" size={30} />
          </View>
          <ThemedText type="title">Ready to build</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            A small iOS-first foundation with the services most apps need.
          </ThemedText>
        </View>

        {__DEV__ && <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">App status</ThemedText>
          <StatusRow label="Supabase" ready={serviceStatus.supabase} />
          <StatusRow label="PostHog" ready={serviceStatus.posthog} />
          <StatusRow label="AppsFlyer" ready={serviceStatus.appsFlyer} />
          <StatusRow label="RevenueCat" ready={serviceStatus.revenueCat} />
        </ThemedView>}

        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <ThemedText type="subtitle">{env.revenueCatEntitlementId}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {status === 'ready' ? (isPro ? 'Entitlement active' : 'No active entitlement') : status === 'error' ? 'Unable to check access. Tap below to retry.' : status === 'disabled' ? 'Subscriptions unavailable' : 'Checking access…'}
              </ThemedText>
            </View>
            <View style={[styles.badge, { backgroundColor: isPro ? Colors.green : theme.backgroundSelected }]}>
              <ThemedText type="smallBold" style={isPro && styles.whiteText}>
                {status === 'ready' ? (isPro ? 'PRO' : 'FREE') : '…'}
              </ThemedText>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!serviceStatus.revenueCat || isOpeningPaywall || billingBusy}
            onPress={handlePaywall}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: Colors.accent },
              pressed && styles.pressed,
              (!serviceStatus.revenueCat || isOpeningPaywall) && styles.disabled,
            ]}>
            <ThemedText type="smallBold" style={styles.whiteText}>
              {isOpeningPaywall ? 'Opening…' : 'Show RevenueCat paywall'}
            </ThemedText>
          </Pressable>
        </ThemedView>

        {__DEV__ && <ThemedText themeColor="textSecondary" type="small" style={styles.footnote}>
          Add your keys to .env, then rebuild with npx expo run:ios.
        </ThemedText>}
      </SafeAreaView>
    </ScrollView>
  );
}

function StatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: ready ? Colors.green : Colors.orange }]} />
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <ThemedText themeColor="textSecondary" type="small">
        {ready ? 'Configured' : 'Needs key'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: { textAlign: 'center', maxWidth: 360 },
  card: { padding: Spacing.four, borderRadius: 22, gap: Spacing.three },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  flex: { flex: 1 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  whiteText: { color: '#FFFFFF' },
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.four },
});
