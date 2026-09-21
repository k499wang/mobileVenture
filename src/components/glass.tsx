import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, useColorScheme, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { appDefinition } from '@/config/app-definition';

type SurfaceProps = PropsWithChildren<{ style?: StyleProp<ViewStyle>; tone?: 'default' | 'accent' }>;
export type GlassPalette = { dark: boolean; page: string; text: string; muted: string; line: string; input: string; chip: string };

function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

export function useGlassPalette(): GlassPalette {
  const deviceScheme = useColorScheme();
  const dark = resolveDarkAppearance(appDefinition.brand.appearance, deviceScheme);
  return dark
    ? { dark, page: '#111116', text: '#F7F7FB', muted: '#B5B5C2', line: '#FFFFFF2B', input: '#25252D', chip: '#2D2D37' }
    : { dark, page: '#F7F7FB', text: '#19191F', muted: '#686875', line: '#D9D9E2', input: '#FFFFFFD9', chip: '#EDEDF4' };
}

function resolveDarkAppearance(preference: 'system' | 'light' | 'dark', deviceScheme: ReturnType<typeof useColorScheme>) {
  return preference === 'dark' || (preference === 'system' && deviceScheme === 'dark');
}

export function GlassSurface({ children, style, tone = 'default', accentColor = appDefinition.brand.primary }: SurfaceProps & { accentColor?: string }) {
  const palette = useGlassPalette();
  const reduced = useReducedTransparency();
  const common = [styles.surface, { borderColor: palette.dark ? '#FFFFFF24' : '#FFFFFFB8' }, style];
  const tint = tone === 'accent' ? accentColor : palette.dark ? '#24242B' : '#FFFFFF';
  if (!reduced && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) return <GlassView tintColor={tint} colorScheme={palette.dark ? 'dark' : 'light'} style={common}>{children}</GlassView>;
  if (!reduced) return <BlurView tint={palette.dark ? 'dark' : 'light'} intensity={40} style={[common, { backgroundColor: palette.dark ? '#202027D9' : '#FFFFFFC9' }]}>{children}</BlurView>;
  return <View style={[common, { backgroundColor: palette.dark ? '#26262D' : '#FFFFFF' }]}>{children}</View>;
}

export function GlassCard(props: SurfaceProps) { return <GlassSurface {...props} style={[styles.card, props.style]} />; }
export function GlassSheet(props: SurfaceProps) { return <GlassSurface {...props} style={[styles.sheet, props.style]} />; }
export function GlassTabBar(props: SurfaceProps) { return <GlassSurface {...props} style={[styles.tabBar, props.style]} />; }

export function GlassButton({ children, style, disabled, color = appDefinition.brand.primary, ...props }: PropsWithChildren<PressableProps & { style?: StyleProp<ViewStyle>; color?: string }>) {
  return <Pressable {...props} disabled={disabled} style={({ pressed }) => [styles.button, { backgroundColor: color }, style, (pressed || disabled) && styles.dim]}>{children}</Pressable>;
}

export function GlassOptionTile({ label, detail, selected, onPress, color = appDefinition.brand.primary, multiple = false }: { label: string; detail?: string; selected: boolean; onPress: () => void; color?: string; multiple?: boolean }) {
  const palette = useGlassPalette();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ selected, checked: multiple ? selected : undefined }} onPress={onPress} style={[styles.option, { borderColor: palette.line, backgroundColor: palette.dark ? '#202027A8' : '#FFFFFFA8' }, selected && { borderColor: color, borderWidth: 2, backgroundColor: `${color}24` }]}><Text style={[styles.optionLabel, { color: palette.text }]}>{label}</Text>{detail ? <Text style={[styles.optionDetail, { color: palette.muted }]}>{detail}</Text> : null}</Pressable>;
}

export function GlassInput(props: ComponentProps<typeof TextInput>) { const palette = useGlassPalette(); return <TextInput placeholderTextColor={palette.muted} {...props} style={[styles.input, { backgroundColor: palette.input, borderColor: palette.line, color: palette.text }, props.style]} />; }
export function GlassChip({ label, selected, onPress, color = appDefinition.brand.primary }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) { const palette = useGlassPalette(); return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: palette.chip }, selected && { backgroundColor: `${color}2B` }]}><Text style={[styles.chipLabel, { color: palette.text }]}>{label}</Text></Pressable>; }
export function GlassHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }) { const palette = useGlassPalette(); return <View style={styles.header}><Text style={[styles.headerTitle, { color: palette.text }]}>{title}</Text>{trailing}</View>; }

const styles = StyleSheet.create({
  surface: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth }, card: { borderRadius: 24, padding: 20 }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, tabBar: { borderRadius: 24, padding: 8, flexDirection: 'row' },
  button: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, dim: { opacity: 0.58 },
  option: { minHeight: 64, borderRadius: 18, borderWidth: 1, padding: 16, justifyContent: 'center', gap: 3 }, optionLabel: { fontSize: 16, fontWeight: '600' }, optionDetail: { fontSize: 13 }, input: { minHeight: 56, borderRadius: 18, paddingHorizontal: 16, fontSize: 17, borderWidth: 1 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }, chipLabel: { fontSize: 13, fontWeight: '600' }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { fontSize: 20, fontWeight: '700' },
});
