import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text as RNText, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass';
import { useTheme, type TextVariant } from '@/theme/theme';

/** Shared primitives. They read only theme tokens; restyle in src/theme/theme.ts. */

export function Text({ variant = 'body', color, style, ...props }: ComponentProps<typeof RNText> & { variant?: TextVariant; color?: 'text' | 'muted' | 'brand' | 'onBrand' | 'danger' }) {
  const t = useTheme();
  const resolved = color === 'brand' ? t.brand : color === 'onBrand' ? t.onBrand : color === 'danger' ? t.colors.danger : color === 'muted' ? t.colors.muted : t.colors.text;
  const bold = Number(t.text[variant].fontWeight) >= 600;
  return <RNText {...props} style={[t.text[variant] as TextStyle, { color: resolved, fontFamily: bold ? t.fonts.bold : t.fonts.regular }, style]} />;
}

/** Full-height scrollable page with theme background. */
export function Screen({ children, scroll = true, style }: PropsWithChildren<{ scroll?: boolean; style?: StyleProp<ViewStyle> }>) {
  const t = useTheme();
  const content = [{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl * 2, gap: t.spacing.lg }, style];
  if (!scroll) return <SafeAreaView style={[styles.fill, { backgroundColor: t.colors.page }]}><View style={[styles.fill, content]}>{children}</View></SafeAreaView>;
  return <ScrollView style={{ backgroundColor: t.colors.page }} contentContainerStyle={content} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const t = useTheme();
  return <GlassSurface style={[{ borderRadius: t.radius.lg, padding: t.spacing.lg - 4, gap: t.spacing.md - 2 }, style]}>{children}</GlassSurface>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ title, onPress, variant = 'primary', disabled, loading, icon, style }: { title: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; loading?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const background = { primary: t.brand, secondary: t.colors.surfaceMuted, danger: t.colors.danger, ghost: 'transparent' }[variant];
  const foreground = variant === 'primary' || variant === 'danger' ? t.onBrand : variant === 'ghost' ? t.colors.muted : t.colors.text;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, { minHeight: t.button.height, borderRadius: t.button.radius, backgroundColor: background, gap: t.spacing.sm }, style, (pressed || disabled) && styles.dim]}>
    {loading ? <ActivityIndicator color={foreground} /> : <>{icon}<RNText style={[t.text.label as TextStyle, { color: foreground, fontFamily: t.fonts.bold }]}>{title}</RNText></>}
  </Pressable>;
}

/** Selectable tile used by onboarding select steps. */
export function OptionCard({ label, detail, selected, multiple, onPress }: { label: string; detail?: string; selected: boolean; multiple?: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ selected, checked: multiple ? selected : undefined }} onPress={onPress}
    style={[styles.option, { borderRadius: t.radius.md, padding: t.spacing.md, borderColor: selected ? t.brand : t.colors.line, borderWidth: selected ? 2 : 1, backgroundColor: selected ? `${t.brand}24` : `${t.colors.surface}A8` }]}>
    <Text variant="label">{label}</Text>{detail ? <Text variant="caption" color="muted">{detail}</Text> : null}
  </Pressable>;
}

export function Input(props: ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return <TextInput placeholderTextColor={t.colors.muted} {...props} style={[styles.input, { borderRadius: t.radius.md, backgroundColor: t.colors.surface, borderColor: t.colors.line, color: t.colors.text, fontFamily: t.fonts.regular }, props.style]} />;
}

export function Chip({ label, selected }: { label: string; selected?: boolean }) {
  const t = useTheme();
  return <View style={[styles.chip, { borderRadius: t.radius.pill, backgroundColor: selected ? `${t.brand}2B` : t.colors.surfaceMuted }]}><Text variant="caption">{label}</Text></View>;
}

/** Grouped settings-style section: optional title + a card of rows. */
export function Section({ title, footer, children }: PropsWithChildren<{ title?: string; footer?: string }>) {
  const t = useTheme();
  return <View style={{ gap: t.spacing.sm }}>
    {title ? <Text variant="caption" color="muted" style={styles.sectionTitle}>{title.toUpperCase()}</Text> : null}
    <GlassSurface style={{ borderRadius: t.radius.lg }}>{children}</GlassSurface>
    {footer ? <Text variant="caption" color="muted" style={{ paddingHorizontal: t.spacing.md }}>{footer}</Text> : null}
  </View>;
}

/** A tappable row inside a Section. Pass `toggle` for a switch row or `trailing` for custom content. */
export function ListRow({ title, detail, onPress, destructive, disabled, toggle, trailing, last }: { title: string; detail?: string; onPress?: () => void; destructive?: boolean; disabled?: boolean; toggle?: { value: boolean; onChange: (value: boolean) => void }; trailing?: ReactNode; last?: boolean }) {
  const t = useTheme();
  return <Pressable accessibilityRole={toggle ? 'switch' : 'button'} disabled={disabled || (!onPress && !toggle)} onPress={onPress}
    style={({ pressed }) => [styles.row, { paddingHorizontal: t.spacing.md, borderBottomColor: t.colors.line, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }, (pressed || disabled) && styles.dim]}>
    <View style={styles.fill}>
      <Text color={destructive ? 'danger' : 'text'}>{title}</Text>
      {detail ? <Text variant="caption" color="muted">{detail}</Text> : null}
    </View>
    {toggle ? <Switch value={toggle.value} onValueChange={toggle.onChange} trackColor={{ true: t.brand }} disabled={disabled} /> : trailing ?? (onPress ? <Text color="muted">›</Text> : null)}
  </Pressable>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  dim: { opacity: 0.58 },
  option: { minHeight: 64, justifyContent: 'center', gap: 3 },
  input: { minHeight: 56, paddingHorizontal: 16, fontSize: 17, borderWidth: 1 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7 },
  sectionTitle: { paddingHorizontal: 16, letterSpacing: 0.6 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
