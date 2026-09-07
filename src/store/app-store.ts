import { create } from 'zustand';
export type EntitlementStatus = 'unknown' | 'loading' | 'ready' | 'error' | 'disabled';
type AppState = {
  isPro: boolean;
  entitlementStatus: EntitlementStatus;
  billingBusy: boolean;
  setIsPro: (isPro: boolean) => void;
  reset: () => void;
};
export const useAppStore = create<AppState>((set) => ({
  isPro: false, entitlementStatus: 'unknown', billingBusy: false,
  setIsPro: (isPro) => set({ isPro, entitlementStatus: 'ready' }),
  reset: () => set({ isPro: false, entitlementStatus: 'unknown' }),
}));
