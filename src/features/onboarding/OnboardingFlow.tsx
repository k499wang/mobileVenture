import Slider from '@react-native-community/slider';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Answer, Answers, OnboardingStep } from '@/config/app-definition-types';
import { hasAnswer, interpolate, stepIsVisible } from '@/features/onboarding/logic';
import { GlassButton, GlassInput, GlassOptionTile, useGlassPalette } from '@/components/glass';

export type OnboardingCallbacks = {
  requestPermission?: (permission: 'notifications' | 'tracking') => Promise<void>;
  skipPermission?: (permission: 'notifications' | 'tracking') => void;
  presentPaywall?: () => Promise<void>;
  track?: (event: 'onboarding_step_viewed' | 'onboarding_answered', properties: Record<string, unknown>) => void;
};

export function OnboardingFlow({ steps, onComplete, callbacks = {}, brandColor = '#6C5CE7', initialAnswers = {}, initialPosition = 0, onAnswer, onPositionChange }: { steps: readonly OnboardingStep[]; onComplete: (answers: Answers) => void; callbacks?: OnboardingCallbacks; brandColor?: string; initialAnswers?: Answers; initialPosition?: number; onAnswer?: (key: string, value: Answer) => void; onPositionChange?: (position: number) => void }) {
  const palette = useGlassPalette();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const visibleSteps = useMemo(() => steps.filter((step) => stepIsVisible(step, answers)), [steps, answers]);
  const [position, setPosition] = useState(initialPosition);
  const safePosition = Math.min(position, Math.max(visibleSteps.length - 1, 0));
  const step = visibleSteps[safePosition];
  const transition = useState(() => new Animated.Value(1))[0];

  useEffect(() => { if (step) { callbacks.track?.('onboarding_step_viewed', { step_id: step.id, step_type: step.type, position: safePosition }); onPositionChange?.(safePosition); } }, [callbacks, onPositionChange, safePosition, step]);
  useEffect(() => { transition.setValue(0); Animated.timing(transition, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, [step?.id, transition]);
  if (!step) return null;

  const setAnswer = (key: string, value: Answer) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    onAnswer?.(key, value);
    callbacks.track?.('onboarding_answered', { step_id: step.id, answer_key: key });
  };
  const next = () => {
    const nextAnswers = step.type === 'slider' && !hasAnswer(answers[step.answerKey])
      ? { ...answers, [step.answerKey]: step.initial }
      : answers;
    if (nextAnswers !== answers && step.type === 'slider') {
      setAnswers(nextAnswers);
      onAnswer?.(step.answerKey, step.initial);
      callbacks.track?.('onboarding_answered', { step_id: step.id, answer_key: step.answerKey });
    }
    if (safePosition === visibleSteps.length - 1) onComplete(nextAnswers);
    else setPosition((value) => value + 1);
  };
  const requiredAnswer = 'answerKey' in step && !('optional' in step && step.optional);
  const canAdvance = step.type === 'slider' || !requiredAnswer || hasAnswer(answers[step.answerKey]);

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.page }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={[styles.progressTrack, { backgroundColor: palette.line }]}><View style={[styles.progress, { backgroundColor: brandColor, width: `${((safePosition + 1) / visibleSteps.length) * 100}%` }]} /></View>
    {safePosition > 0 ? <Pressable onPress={() => setPosition((value) => value - 1)} accessibilityRole="button"><Text style={[styles.back, { color: palette.muted }]}>Back</Text></Pressable> : <View />}
    <Animated.View style={{ opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
    <View style={styles.copy}><Text style={[styles.title, { color: palette.text }]}>{interpolate(step.title, answers)}</Text>{step.body ? <Text style={[styles.body, { color: palette.muted }]}>{interpolate(step.body, answers)}</Text> : null}</View>
    <StepBody step={step} answers={answers} setAnswer={setAnswer} onAutoAdvance={next} brandColor={brandColor} />
    {step.type !== 'loading' ? <GlassButton disabled={!canAdvance} onPress={async () => {
      if (step.type === 'permission') await callbacks.requestPermission?.(step.permission);
      if (step.type === 'paywall') await callbacks.presentPaywall?.();
      next();
    }} color={brandColor}><Text style={styles.buttonLabel}>{step.type === 'permission' ? step.allowLabel ?? 'Continue' : step.cta ?? (step.type === 'paywall' ? 'Continue' : 'Continue')}</Text></GlassButton> : null}
    {step.type === 'permission' && step.skipLabel ? <Pressable accessibilityRole="button" onPress={() => { callbacks.skipPermission?.(step.permission); next(); }}><Text style={[styles.skip, { color: palette.muted }]}>{step.skipLabel}</Text></Pressable> : null}
    </Animated.View>
  </ScrollView></SafeAreaView>;
}

function StepBody({ step, answers, setAnswer, onAutoAdvance, brandColor }: { step: OnboardingStep; answers: Answers; setAnswer: (key: string, value: Answer) => void; onAutoAdvance: () => void; brandColor: string }) {
  const palette = useGlassPalette();
  useEffect(() => {
    if (step.type !== 'loading') return;
    const timer = setTimeout(onAutoAdvance, step.durationMs ?? 1400);
    return () => clearTimeout(timer);
  }, [onAutoAdvance, step]);
  if (step.type === 'select') return <View style={styles.options}>{step.options.map((option) => {
    const selectedValues = Array.isArray(answers[step.answerKey]) ? answers[step.answerKey] as string[] : [];
    const selected = step.multiple ? selectedValues.includes(option.value) : answers[step.answerKey] === option.value;
    return <GlassOptionTile key={option.value} {...option} color={brandColor} multiple={step.multiple} selected={selected} onPress={() => setAnswer(step.answerKey, step.multiple ? (selected ? selectedValues.filter((value) => value !== option.value) : [...selectedValues, option.value]) : option.value)} />;
  })}</View>;
  if (step.type === 'text') return <GlassInput value={String(answers[step.answerKey] ?? '')} onChangeText={(value) => setAnswer(step.answerKey, value)} placeholder={step.placeholder} keyboardType={step.keyboard === 'numeric' ? 'numeric' : 'default'} autoFocus />;
  if (step.type === 'slider') { const savedValue = answers[step.answerKey]; const value = typeof savedValue === 'number' ? savedValue : step.initial; return <View style={styles.slider}><Text style={[styles.sliderValue, { color: palette.text }]}>{value}{step.unit ?? ''}</Text><Slider minimumValue={step.minimum} maximumValue={step.maximum} value={value} minimumTrackTintColor={brandColor} onSlidingComplete={(next) => setAnswer(step.answerKey, Math.round(next))} /></View>; }
  if (step.type === 'testimonial') return <View style={styles.testimonial}><Text style={[styles.quote, { color: palette.text }]}>“{step.quote}”</Text><Text style={[styles.author, { color: palette.muted }]}>— {step.author}</Text></View>;
  if (step.type === 'loading') return <View style={styles.loading}><ActivityIndicator size="large" color={brandColor} /></View>;
  if (step.type === 'paywall') return <View style={[styles.paywall, { backgroundColor: palette.dark ? '#25252DB8' : '#FFFFFFAA' }]}><Text style={[styles.paywallTitle, { color: palette.text }]}>Plans load securely from RevenueCat.</Text><Text style={[styles.body, { color: palette.muted }]}>This screen opens your configured offering and prices.</Text></View>;
  if (step.type === 'permission') return <View style={styles.permission}><Text style={[styles.permissionIcon, { color: brandColor }]}>{step.permission === 'notifications' ? '◌' : '◈'}</Text><Text style={[styles.body, { color: palette.muted }]}>You can always change this later in Settings.</Text></View>;
  if (step.type === 'info' && step.image) return <Image source={{ uri: step.image.uri }} accessibilityLabel={step.image.accessibilityLabel} style={styles.image} resizeMode="contain" />;
  return null;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, content: { flexGrow: 1, padding: 24, gap: 24 }, progressTrack: { height: 5, borderRadius: 99 }, progress: { height: 5, borderRadius: 99 }, back: { fontSize: 16, fontWeight: '600' }, copy: { gap: 10, marginBottom: 24 }, title: { fontSize: 31, fontWeight: '700', letterSpacing: -0.6 }, body: { fontSize: 16, lineHeight: 23 }, options: { gap: 12, marginBottom: 24 }, buttonLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }, slider: { gap: 12, marginBottom: 24 }, sliderValue: { alignSelf: 'center', fontSize: 38, fontWeight: '700' }, testimonial: { paddingVertical: 20, gap: 14, marginBottom: 24 }, quote: { fontSize: 23, fontStyle: 'italic', lineHeight: 32 }, author: { fontSize: 15, fontWeight: '600' }, loading: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center' }, paywall: { padding: 20, borderRadius: 20, gap: 8, marginBottom: 24 }, paywallTitle: { fontWeight: '700', fontSize: 17 }, permission: { alignItems: 'center', gap: 16, paddingVertical: 28, marginBottom: 24 }, permissionIcon: { fontSize: 64 }, skip: { textAlign: 'center', fontSize: 15, fontWeight: '600', marginTop: 16 }, image: { width: '100%', height: 180, marginBottom: 24, borderRadius: 20 },
});
