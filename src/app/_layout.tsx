import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DeepLinkHandler } from '@/components/deep-link-handler';
import { AuthGate } from '@/features/auth/AuthGate';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { AppProviders } from '@/providers/app-providers';
import { initializeErrorReporting, reportError } from '@/services/errors';
import { useTheme } from '@/theme/theme';
export { ErrorScreen as ErrorBoundary } from '@/components/error-screen';

initializeErrorReporting();

void SplashScreen.preventAutoHideAsync().catch(error => reportError(error, 'splash.prevent-hide'));

/** Flow: onboarding (ends with the soft paywall) → required sign-in → tabs. */
function RootLayout() {
  const theme = useTheme();
  const navigationTheme = theme.dark ? DarkTheme : DefaultTheme;
  return (
    <AppProviders>
      <ThemeProvider value={{ ...navigationTheme, colors: { ...navigationTheme.colors, primary: theme.brand, background: theme.colors.page } }}>
        <AnimatedSplashOverlay color={theme.brand} />
        <OnboardingGate>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }} />
            <DeepLinkHandler />
          </AuthGate>
        </OnboardingGate>
      </ThemeProvider>
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);
