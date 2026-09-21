import { Tabs, TabList, TabSlot, TabTrigger, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassTabBar, useGlassPalette } from '@/components/glass';
import { appDefinition } from '@/config/app-definition';

export default function AppTabs() {
  return <Tabs><TabSlot style={{ height: '100%' }} /><TabList asChild><CustomTabList><TabTrigger name="home" href="/" asChild><TabButton>Home</TabButton></TabTrigger><TabTrigger name="explore" href="/explore" asChild><TabButton>Settings</TabButton></TabTrigger></CustomTabList></TabList></Tabs>;
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const palette = useGlassPalette();
  return <Pressable {...props} style={({ pressed }) => [styles.button, isFocused && { backgroundColor: `${appDefinition.brand.primary}2B` }, pressed && styles.pressed]}><Text style={{ color: isFocused ? palette.text : palette.muted, fontWeight: '700' }}>{children}</Text></Pressable>;
}

function CustomTabList(props: TabListProps) {
  const palette = useGlassPalette();
  return <View {...props} style={[styles.container, props.style]}><GlassTabBar style={styles.bar}><Text style={[styles.brand, { color: palette.text }]}>{appDefinition.name}</Text>{props.children}</GlassTabBar></View>;
}

const styles = StyleSheet.create({ container: { position: 'absolute', width: '100%', padding: 16, alignItems: 'center' }, bar: { width: '100%', maxWidth: 760, alignItems: 'center', gap: 8 }, brand: { marginRight: 'auto', fontSize: 13, fontWeight: '800' }, button: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14 }, pressed: { opacity: 0.7 } });
