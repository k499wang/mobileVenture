import { DatePicker, Host } from '@expo/ui/swift-ui';
import Slider from '@react-native-community/slider';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { Button, Input, OptionCard, Text } from '@/components/ui';
import type { Answer, Answers, ChartStep, OnboardingStep, VideoStep } from '@/config/app-definition-types';
import { canAdvance, hasAnswer, interpolate, stepIsVisible } from '@/features/onboarding/logic';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme';

export type OnboardingCallbacks = {
  requestPermission?: (permission: 'notifications' | 'tracking') => Promise<void>;
  skipPermission?: (permission: 'notifications' | 'tracking') => void;
  presentPaywall?: () => Promise<void>;
  requestRating?: () => Promise<void>;
  track?: (event: 'onboarding_step_viewed' | 'onboarding_answered', properties: Record<string, unknown>) => void;
};

/**
 * Renders any list of typed steps. To add a kind: extend the union in
 * app-definition-types.ts and add one branch to StepBody below.
 */
export function OnboardingFlow({ steps, onComplete, callbacks = {}, initialAnswers = {}, initialPosition = 0, onAnswer, onPositionChange }: { steps: readonly OnboardingStep[]; onComplete: (answers: Answers) => void; callbacks?: OnboardingCallbacks; initialAnswers?: Answers; initialPosition?: number; onAnswer?: (key: string, value: Answer) => void; onPositionChange?: (position: number) => void }) {
  const theme = useTheme();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const visibleSteps = useMemo(() => steps.filter((step) => stepIsVisible(step, answers)), [steps, answers]);
  const [position, setPosition] = useState(initialPosition);
  const [busy, setBusy] = useState(false);
  const safePosition = Math.min(position, Math.max(visibleSteps.length - 1, 0));
  const step = visibleSteps[safePosition];
  const transition = useState(() => new Animated.Value(1))[0];

  useEffect(() => { if (step) { callbacks.track?.('onboarding_step_viewed', { step_id: step.id, step_type: step.type, position: safePosition }); onPositionChange?.(safePosition); } }, [callbacks, onPositionChange, safePosition, step]);
  useEffect(() => { transition.setValue(0); Animated.timing(transition, { toValue: 1, duration: theme.motion.stepTransitionMs, useNativeDriver: true }).start(); }, [step?.id, transition, theme.motion.stepTransitionMs]);
  if (!step) return null;

  const setAnswer = (key: string, value: Answer) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    onAnswer?.(key, value);
    callbacks.track?.('onboarding_answered', { step_id: step.id, answer_key: key });
  };
  const next = () => {
    let nextAnswers = answers;
    // Sliders and date pickers show a default value; save it if the user did not move it.
    if ((step.type === 'slider' || step.type === 'date') && !hasAnswer(answers[step.answerKey])) {
      const value = step.type === 'slider' ? step.initial : new Date().toISOString();
      nextAnswers = { ...answers, [step.answerKey]: value };
      setAnswer(step.answerKey, value);
    }
    if (safePosition === visibleSteps.length - 1) onComplete(nextAnswers);
    else setPosition((value) => value + 1);
  };
  const primary = async () => {
    setBusy(true);
    try {
      if (step.type === 'permission') await callbacks.requestPermission?.(step.permission);
      if (step.type === 'paywall') await callbacks.presentPaywall?.();
      if (step.type === 'rating') await callbacks.requestRating?.();
    } finally { setBusy(false); }
    next();
  };
  const primaryLabel = step.type === 'permission' ? step.allowLabel : step.type === 'rating' ? step.cta ?? 'onboarding.rateCta' : step.cta;
  const skipLabel = step.type === 'permission' || step.type === 'rating' ? step.skipLabel : undefined;

  return <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.page }]}><ScrollView contentContainerStyle={[styles.content, { padding: theme.spacing.lg, gap: theme.spacing.lg }]} keyboardShouldPersistTaps="handled">
    <View style={[styles.progressTrack, { backgroundColor: theme.colors.line }]}><View style={[styles.progressTrack, { backgroundColor: theme.brand, width: `${((safePosition + 1) / visibleSteps.length) * 100}%` }]} /></View>
    {safePosition > 0 ? <Pressable onPress={() => setPosition((value) => value - 1)} accessibilityRole="button" hitSlop={12}><Text variant="label" color="muted">{t('common.back')}</Text></Pressable> : <View />}
    <Animated.View style={[styles.fill, { gap: theme.spacing.lg, opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {step.mascot ? <Mascot pose={step.mascot} style={styles.center} /> : null}
      <View style={{ gap: theme.spacing.sm + 2 }}>
        <Text variant="title">{interpolate(t(step.title), answers)}</Text>
        {step.body ? <Text color="muted">{interpolate(t(step.body), answers)}</Text> : null}
      </View>
      <StepBody step={step} answers={answers} setAnswer={setAnswer} onAutoAdvance={next} />
      {step.type !== 'loading' ? <Button title={t(primaryLabel ?? 'common.continue')} loading={busy} disabled={!canAdvance(step, answers)} onPress={() => void primary()} /> : null}
      {skipLabel ? <Button variant="ghost" title={t(skipLabel)} onPress={() => { if (step.type === 'permission') callbacks.skipPermission?.(step.permission); next(); }} /> : null}
    </Animated.View>
  </ScrollView></SafeAreaView>;
}

function StepBody({ step, answers, setAnswer, onAutoAdvance }: { step: OnboardingStep; answers: Answers; setAnswer: (key: string, value: Answer) => void; onAutoAdvance: () => void }) {
  const theme = useTheme();
  useEffect(() => {
    if (step.type !== 'loading') return;
    const timer = setTimeout(onAutoAdvance, step.durationMs ?? 1400);
    return () => clearTimeout(timer);
  }, [onAutoAdvance, step]);

  switch (step.type) {
    case 'select': {
      const selectedValues = Array.isArray(answers[step.answerKey]) ? answers[step.answerKey] as string[] : [];
      return <View style={{ gap: theme.spacing.md - 4 }}>{step.options.map((option) => {
        const selected = step.multiple ? selectedValues.includes(option.value) : answers[step.answerKey] === option.value;
        return <OptionCard key={option.value} label={t(option.label)} detail={option.detail ? t(option.detail) : undefined} multiple={step.multiple} selected={selected}
          onPress={() => setAnswer(step.answerKey, step.multiple ? (selected ? selectedValues.filter((value) => value !== option.value) : [...selectedValues, option.value]) : option.value)} />;
      })}</View>;
    }
    case 'text':
      return <Input value={String(answers[step.answerKey] ?? '')} onChangeText={(value) => setAnswer(step.answerKey, value)} placeholder={step.placeholder ? t(step.placeholder) : undefined} keyboardType={step.keyboard === 'numeric' ? 'numeric' : 'default'} autoFocus />;
    case 'slider': {
      const saved = answers[step.answerKey];
      const value = typeof saved === 'number' ? saved : step.initial;
      return <View style={{ gap: theme.spacing.md - 4 }}><Text variant="display" style={styles.center}>{value}{step.unit ?? ''}</Text><Slider minimumValue={step.minimum} maximumValue={step.maximum} step={1} value={value} minimumTrackTintColor={theme.brand} onSlidingComplete={(next) => setAnswer(step.answerKey, Math.round(next))} /></View>;
    }
    case 'date': {
      const saved = answers[step.answerKey];
      return <Host matchContents style={styles.center}><DatePicker selection={typeof saved === 'string' ? new Date(saved) : new Date()} displayedComponents={[step.mode === 'time' ? 'hourAndMinute' : 'date']} onDateChange={(date) => setAnswer(step.answerKey, date.toISOString())} /></Host>;
    }
    case 'testimonial':
      return <View style={{ gap: theme.spacing.md - 2, paddingVertical: theme.spacing.lg - 4 }}><Text variant="title" style={styles.quote}>“{t(step.quote)}”</Text><Text variant="label" color="muted">— {step.author}</Text></View>;
    case 'loading':
      return <View style={styles.loading}><ActivityIndicator size="large" color={theme.brand} /></View>;
    case 'chart':
      return <PlanChart step={step} />;
    case 'video':
      return <OnboardingVideo step={step} />;
    case 'paywall':
      return <Text color="muted">{t('onboarding.paywallHint')}</Text>;
    case 'permission':
      return <View style={[styles.center, { paddingVertical: theme.spacing.xl }]}><Text style={styles.icon} color="brand">{step.permission === 'notifications' ? '◌' : '◈'}</Text><Text color="muted">{t('onboarding.permissionHint')}</Text></View>;
    case 'rating':
      return <Text style={[styles.icon, styles.center]} color="brand">★★★★★</Text>;
    case 'info':
      return step.image ? <Image source={{ uri: step.image.uri }} accessibilityLabel={step.image.accessibilityLabel} style={[styles.media, { borderRadius: theme.radius.lg }]} resizeMode="contain" /> : null;
  }
}

function PlanChart({ step }: { step: ChartStep }) {
  const theme = useTheme();
  const values = step.values ?? [0.2, 0.35, 0.55, 0.8, 1];
  return <View style={{ gap: theme.spacing.sm }} accessibilityRole="image" accessibilityLabel={t(step.title)}>
    <View style={[styles.chart, { gap: theme.spacing.sm }]}>
      {values.map((value, index) => <View key={index} style={{ flex: 1, height: `${Math.max(0.05, Math.min(1, value)) * 100}%`, borderRadius: theme.radius.sm, backgroundColor: theme.brand, opacity: 0.35 + 0.65 * ((index + 1) / values.length) }} />)}
    </View>
    <View style={styles.chartLabels}><Text variant="caption" color="muted">{t(step.startLabel ?? '')}</Text><Text variant="caption" color="muted">{t(step.endLabel ?? '')}</Text></View>
  </View>;
}

function OnboardingVideo({ step }: { step: VideoStep }) {
  const theme = useTheme();
  const player = useVideoPlayer(step.uri, (instance) => { instance.loop = step.loop ?? true; instance.muted = step.muted ?? true; instance.play(); });
  return <VideoView player={player} style={[styles.media, { borderRadius: theme.radius.lg }]} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, content: { flexGrow: 1 }, center: { alignSelf: 'center', alignItems: 'center', gap: 16 },
  progressTrack: { height: 5, borderRadius: 99 }, quote: { fontStyle: 'italic' }, icon: { fontSize: 56, lineHeight: 64 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' }, media: { width: '100%', height: 220 },
  chart: { height: 200, flexDirection: 'row', alignItems: 'flex-end' }, chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
