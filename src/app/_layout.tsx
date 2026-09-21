import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DeepLinkHandler } from '@/components/deep-link-handler';
import AppTabs from '@/components/app-tabs';
import { AppProviders } from '@/providers/app-providers';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { appDefinition } from '@/config/app-definition';
import { initializeErrorReporting, reportError } from '@/services/errors';
export { ErrorScreen as ErrorBoundary } from '@/components/error-screen';

initializeErrorReporting();

void SplashScreen.preventAutoHideAsync().catch(error => reportError(error, 'splash.prevent-hide'));

function TabLayout() {
  const deviceScheme = useColorScheme();
  const colorScheme = appDefinition.brand.appearance === 'system' ? deviceScheme : appDefinition.brand.appearance;

  return (
    <AppProviders>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay color={appDefinition.brand.primary} />
        <OnboardingGate>
          <AppTabs />
          <DeepLinkHandler />
        </OnboardingGate>
      </ThemeProvider>
    </AppProviders>
  );
}

export default Sentry.wrap(TabLayout);
