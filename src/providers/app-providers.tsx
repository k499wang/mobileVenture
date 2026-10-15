import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { subscribeIdentity } from '@/services/identity';
import { initializeAppServices } from '@/services/initialize';
import { reportError } from '@/services/errors';
import { syncOnboardingFromCloud } from '@/services/onboarding-data';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 }, mutations: { retry: 0 },
  } }));
  useEffect(() => {
    const unsubscribeIdentity = subscribeIdentity(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
      void syncOnboardingFromCloud().catch(error => reportError(error, 'onboarding.cloud-sync'));
    });
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    function onState(state: string) {
      focusManager.setFocused(state === 'active');
      if (state === 'active') {
        void supabase?.auth.startAutoRefresh();
        void initializeAppServices().catch(error => reportError(error, 'services.init'));
      } else supabase?.auth.stopAutoRefresh();
    }
    // ATT is requested only from the explicit onboarding/settings action.
    if (AppState.currentState === 'active') void supabase?.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', onState);
    return () => {
      unsubscribeIdentity(); unsubscribeNetwork(); subscription.remove();
      supabase?.auth.stopAutoRefresh();
    };
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
