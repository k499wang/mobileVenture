import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useDeepLinkStore } from '@/store/deep-link-store';

export function DeepLinkHandler() {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const pending = useDeepLinkStore(state => state.pending);
  useEffect(() => {
    if (!navigation?.key || !pending) return;
    useDeepLinkStore.getState().consume();
    router.push(pending === 'home' ? '/' : '/explore');
  }, [navigation?.key, pending, router]);
  return null;
}
