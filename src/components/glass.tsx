import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

/**
 * Native Liquid Glass when available, blur otherwise, and an opaque surface for
 * Reduce Transparency or when `theme.glass` is false. Use for cards/sheets only.
 */
export function GlassSurface({ children, style, tint }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; tint?: string }>) {
  const t = useTheme();
  const reduced = useReducedTransparency();
  const common = [styles.surface, { borderColor: t.dark ? '#FFFFFF24' : '#FFFFFFB8' }, style];
  if (t.glass && !reduced && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return <GlassView tintColor={tint ?? t.colors.surface} colorScheme={t.dark ? 'dark' : 'light'} style={common}>{children}</GlassView>;
  }
  if (t.glass && !reduced) {
    return <BlurView tint={t.dark ? 'dark' : 'light'} intensity={40} style={[common, { backgroundColor: `${t.colors.surface}C9` }]}>{children}</BlurView>;
  }
  return <View style={[common, { backgroundColor: t.colors.surface }]}>{children}</View>;
}

const styles = StyleSheet.create({ surface: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth } });
