import { useAppStore } from '@/store/app-store';

/** `isPro` is false until RevenueCat confirms; `loading` covers the first fetch. */
export function useEntitlement() {
  const isPro = useAppStore(state => state.isPro);
  const status = useAppStore(state => state.entitlementStatus);
  return { isPro, loading: status === 'unknown' || status === 'loading', status };
}
