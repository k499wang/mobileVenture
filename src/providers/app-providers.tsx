import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { subscribeIdentity } from '@/services/identity';
import { initializeAppServices } from '@/services/initialize';
import { reportError } from '@/services/errors';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 }, mutations: { retry: 0 },
  } }));
  useEffect(() => {
    const unsubscribeIdentity = subscribeIdentity(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    function onState(state: string) {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
      if (state === 'active') {
        void supabase?.auth.startAutoRefresh();
        void initializeAppServices().catch(error => reportError(error, 'services.init'));
      } else supabase?.auth.stopAutoRefresh();
    }
    // ATT startup is triggered by the splash completion; foreground transitions retry services.
    if (AppState.currentState === 'active') void supabase?.auth.startAutoRefresh();
    if (Platform.OS === 'web') void initializeAppServices().catch(error => reportError(error, 'services.init'));
    const subscription = AppState.addEventListener('change', onState);
    return () => {
      unsubscribeIdentity(); unsubscribeNetwork(); subscription.remove();
      supabase?.auth.stopAutoRefresh();
    };
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
