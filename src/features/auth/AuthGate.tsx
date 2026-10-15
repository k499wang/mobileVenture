import * as AppleAuthentication from 'expo-apple-authentication';
import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { appDefinition } from '@/config/app-definition';
import { authGateState } from '@/features/auth/logic';
import { useAuthSession } from '@/hooks/use-auth-session';
import { t } from '@/i18n';
import { signInWithApple, signInWithGoogle } from '@/services/auth';
import { useTheme } from '@/theme/theme';

/** Shown after onboarding (and its paywall) when `appDefinition.auth.required`. Signing out returns here. */
export function AuthGate({ children }: PropsWithChildren) {
  const { session, configured, loading } = useAuthSession();
  const [devBypass, setDevBypass] = useState(false);
  const state = authGateState({ required: appDefinition.auth.required, configured, loading, signedIn: Boolean(session), devBypass });
  if (state === 'pass') return children;
  if (state === 'loading') return <View style={styles.loading}><ActivityIndicator /></View>;
  return <SignInScreen notConfigured={state === 'not-configured'} onDevBypass={__DEV__ ? () => setDevBypass(true) : undefined} />;
}

function SignInScreen({ notConfigured, onDevBypass }: { notConfigured: boolean; onDevBypass?: () => void }) {
  const theme = useTheme();
  const [working, setWorking] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setWorking(true);
    try { await action(); }
    catch (error) {
      // The user closing Apple's sheet is not an error worth showing.
      if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally { setWorking(false); }
  }
  return <Screen scroll={false} style={styles.center}>
    <View style={{ gap: theme.spacing.sm + 2 }}>
      <Text variant="title">{t('auth.title')}</Text>
      <Text color="muted">{t(notConfigured ? 'auth.notConfigured' : 'auth.body')}</Text>
    </View>
    <View style={{ gap: theme.spacing.md - 4 }}>
      {!notConfigured ? <>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={theme.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={theme.button.radius}
          style={{ height: theme.button.height }}
          onPress={() => { if (!working) void run(signInWithApple); }} />
        <Button variant="secondary" title={t('auth.google')} loading={working} onPress={() => void run(signInWithGoogle)} />
      </> : null}
      {onDevBypass ? <Button variant="ghost" title={t('auth.skipDev')} onPress={onDevBypass} /> : null}
      <Text variant="caption" color="muted" style={styles.legal} onPress={() => { if (appDefinition.links.terms) void Linking.openURL(appDefinition.links.terms); }}>{t('auth.legal')}</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { justifyContent: 'space-between', paddingTop: 80 },
  legal: { textAlign: 'center' },
});
