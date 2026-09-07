import { useState } from 'react';
import { Alert, Button, Linking, ScrollView, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { appConfig } from '@/config/app';
import { envItems, serviceStatus } from '@/config/env';
import { manageSubscription, restorePurchases } from '@/services/purchases';
import { useAppStore } from '@/store/app-store';

export default function SettingsScreen() {
  const [working, setWorking] = useState(false);
  const billingBusy = useAppStore(state => state.billingBusy);
  async function run(action: () => Promise<unknown>) {
    setWorking(true);
    try { await action(); }
    catch { Alert.alert('Unable to complete request', 'Please try again in a moment.'); }
    finally { setWorking(false); }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <ThemedText type="title">Settings</ThemedText>
    {serviceStatus.revenueCat && <>
      <Button title="Restore purchases" disabled={working || billingBusy} onPress={() => void run(async () => {
        const active = await restorePurchases();
        Alert.alert(active ? 'Purchases restored' : 'No active subscription found');
      })} />
      <Button title="Manage subscription" disabled={working || billingBusy} onPress={() => void run(manageSubscription)} />
    </>}
    {Object.entries(appConfig.links).filter(([, url]) => Boolean(url)).map(([name, url]) =>
      <Button key={name} title={name[0].toUpperCase() + name.slice(1)} onPress={() => void run(() => Linking.openURL(url))} />)}
    {__DEV__ && <>
      <ThemedText type="subtitle">Development configuration</ThemedText>
      {envItems.map(item => <ThemedText key={item.name}>{item.label}: {item.configured ? 'Configured' : 'Disabled'}</ThemedText>)}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 24, paddingBottom: 120, gap: 20 } });
