import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appConfig } from '@/config/app';
import { trackEvent } from '@/services/analytics';
import { trackAttributionEvent } from '@/services/attribution';

type OnboardingState = {
  step: number;
  completedVersion: number;
  hydrated: boolean;
  advance: () => void;
  complete: () => void;
};
/** Optional: use hydrated + completedVersion to gate your app-specific onboarding route. */
export const useOnboardingStore = create<OnboardingState>()(persist((set, get) => ({
  step: 0, completedVersion: 0, hydrated: false,
  advance: () => {
    trackEvent('onboarding_step_completed', { version: appConfig.onboardingVersion, step: get().step });
    set({ step: get().step + 1 });
  },
  complete: () => {
    if (get().completedVersion === appConfig.onboardingVersion) return;
    set({ completedVersion: appConfig.onboardingVersion });
    trackEvent('onboarding_completed', { version: appConfig.onboardingVersion });
    void trackAttributionEvent('af_tutorial_completion');
  },
}), {
  name: 'onboarding', storage: createJSONStorage(() => AsyncStorage),
  partialize: ({ step, completedVersion }) => ({ step, completedVersion }),
  onRehydrateStorage: () => () => { useOnboardingStore.setState({ hydrated: true }); },
}));
