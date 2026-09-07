import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DeepLinkHandler } from '@/components/deep-link-handler';
import AppTabs from '@/components/app-tabs';
import { AppProviders } from '@/providers/app-providers';
import { initializeErrorReporting, reportError } from '@/services/errors';
export { ErrorScreen as ErrorBoundary } from '@/components/error-screen';

initializeErrorReporting();

void SplashScreen.preventAutoHideAsync().catch(error => reportError(error, 'splash.prevent-hide'));

function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
        <DeepLinkHandler />
      </ThemeProvider>
    </AppProviders>
  );
}

export default Sentry.wrap(TabLayout);
