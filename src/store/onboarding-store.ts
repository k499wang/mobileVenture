import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { appDefinition } from '@/config/app-definition';
import { trackEvent } from '@/services/analytics';
import { trackAttributionEvent } from '@/services/attribution';
import type { Answer, Answers } from '@/config/app-definition-types';
import { saveOnboardingToCloud } from '@/services/onboarding-data';
import { reportError } from '@/services/errors';

type OnboardingState = {
  step: number;
  completedVersion: number;
  hydrated: boolean;
  answers: Answers;
  setStep: (step: number) => void;
  setAnswer: (key: string, answer: Answer) => void;
  advance: () => void;
  complete: () => void;
};
// Expo Router statically renders web routes in Node, where AsyncStorage cannot
// touch window/localStorage. Native and browser runtime still use AsyncStorage.
const serverStorage: StateStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const onboardingStorage = Platform.OS === 'web' && typeof window === 'undefined' ? serverStorage : AsyncStorage;
/** Optional: use hydrated + completedVersion to gate your app-specific onboarding route. */
export const useOnboardingStore = create<OnboardingState>()(persist((set, get) => ({
  step: 0, completedVersion: 0, hydrated: false, answers: {},
  setStep: (step) => {
    if (step > get().step) trackEvent('onboarding_step_completed', { version: appDefinition.onboardingVersion, step: get().step });
    set({ step });
  },
  setAnswer: (key, answer) => set(state => {
    const answers = { ...state.answers, [key]: answer };
    void saveOnboardingToCloud(answers).catch(error => reportError(error, 'onboarding.cloud-save'));
    return { answers };
  }),
  advance: () => {
    trackEvent('onboarding_step_completed', { version: appDefinition.onboardingVersion, step: get().step });
    set({ step: get().step + 1 });
  },
  complete: () => {
    if (get().completedVersion === appDefinition.onboardingVersion) return;
    set({ completedVersion: appDefinition.onboardingVersion, step: 0 });
    void saveOnboardingToCloud(get().answers).catch(error => reportError(error, 'onboarding.cloud-save'));
    trackEvent('onboarding_completed', { version: appDefinition.onboardingVersion });
    void trackAttributionEvent('af_tutorial_completion');
  },
}), {
  name: 'onboarding', storage: createJSONStorage(() => onboardingStorage),
  partialize: ({ step, completedVersion, answers }) => ({ step, completedVersion, answers }),
  onRehydrateStorage: () => () => { useOnboardingStore.setState({ hydrated: true }); },
}));
