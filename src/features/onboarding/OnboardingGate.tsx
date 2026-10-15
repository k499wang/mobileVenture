import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';

import { appDefinition } from '@/config/app-definition';
import type { Answer } from '@/config/app-definition-types';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { presentPaywall } from '@/services/purchases';
import { trackEvent } from '@/services/analytics';
import { requestTrackingConsent } from '@/services/attribution';
import { useOnboardingStore } from '@/store/onboarding-store';
import { requestNotificationPermission } from '@/services/notification-permissions';
import { setDailyReminderEnabled } from '@/services/reminders';
import { reportError } from '@/services/errors';
import { requestReviewAfterSuccess } from '@/services/review';
import { syncOnboardingFromCloud } from '@/services/onboarding-data';

export function OnboardingGate({ children }: PropsWithChildren) {
  const hydrated = useOnboardingStore(state => state.hydrated);
  const completedVersion = useOnboardingStore(state => state.completedVersion);
  const answers = useOnboardingStore(state => state.answers);
  const step = useOnboardingStore(state => state.step);
  const setAnswer = useOnboardingStore(state => state.setAnswer);
  const setStep = useOnboardingStore(state => state.setStep);
  const complete = useOnboardingStore(state => state.complete);
  const started = useRef(false);
  useEffect(() => {
    if (hydrated && completedVersion !== appDefinition.onboardingVersion && !started.current) {
      started.current = true;
      trackEvent('onboarding_started', { version: appDefinition.onboardingVersion });
    }
  }, [completedVersion, hydrated]);
  useEffect(() => { void syncOnboardingFromCloud(); }, []);
  const callbacks = useMemo(() => ({
    track: (event: 'onboarding_step_viewed' | 'onboarding_answered', properties: Record<string, unknown>) => {
      if (event === 'onboarding_step_viewed') trackEvent('onboarding_step_viewed', { stepId: String(properties.step_id), stepType: String(properties.step_type), position: Number(properties.position) });
      else trackEvent('onboarding_answered', { stepId: String(properties.step_id), answerKey: String(properties.answer_key) });
    },
    requestPermission: async (permission: 'notifications' | 'tracking') => {
      try {
        if (permission === 'tracking') { await requestTrackingConsent(); return; }
        const granted = await requestNotificationPermission();
        if (granted && appDefinition.reminders.enabled) await setDailyReminderEnabled(true);
      } catch (error) { reportError(error, `onboarding.permission.${permission}`); }
    },
    // Soft paywall: a failure or dismissal must never trap the user in onboarding.
    presentPaywall: async () => {
      try { await presentPaywall(appDefinition.subscription.offeringPlacement); }
      catch (error) { reportError(error, 'onboarding.paywall'); }
    },
    requestRating: async () => { await requestReviewAfterSuccess().catch(error => reportError(error, 'onboarding.rating')); },
  }), []);
  if (!hydrated) return <View style={styles.loading}><ActivityIndicator /></View>;
  if (completedVersion === appDefinition.onboardingVersion) return children;
  return <OnboardingFlow
    steps={appDefinition.onboarding}
    initialAnswers={answers}
    initialPosition={step}
    onAnswer={(key: string, value: Answer) => setAnswer(key, value)}
    onPositionChange={setStep}
    onComplete={() => complete()}
    callbacks={callbacks}
  />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
