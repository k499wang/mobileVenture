import { create } from 'zustand';

export type DeepLinkDestination = 'home' | 'settings';
// Explicitly allow destinations. Never navigate to an arbitrary marketing URL/payload.
export const useDeepLinkStore = create<{
  pending: DeepLinkDestination | null;
  receive: (value: unknown) => void;
  consume: () => void;
}>((set) => ({
  pending: null,
  receive: value => { if (value === 'home' || value === 'settings') set({ pending: value }); },
  consume: () => set({ pending: null }),
}));
