import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { env } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/services/analytics';

function requireSupabase() {
  if (!supabase) throw new Error('Sign in is not configured for this app yet.');
  return supabase;
}

function parametersFromUrl(url: string) {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const fragment = url.split('#')[1] ?? '';
  const parameters = new URLSearchParams(query);
  for (const [key, value] of new URLSearchParams(fragment)) parameters.set(key, value);
  return parameters;
}

/** Completes PKCE and implicit Supabase callbacks delivered through the app scheme. */
export async function completeAuthFromUrl(url: string) {
  const client = requireSupabase();
  const params = parametersFromUrl(url);
  const code = params.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return false;
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
  }
  if (params.get('type') === 'magiclink' || params.get('type') === 'signup') trackEvent('auth_completed', { provider: 'email' });
  return true;
}

/** Sends a magic-link email. The session is stored by the existing Supabase client. */
export async function signInWithEmail(email: string) {
  const client = requireSupabase();
  const redirectTo = Linking.createURL('auth/callback');
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
  trackEvent('auth_link_requested', { provider: 'email' });
}

/** Opens Supabase's configured Google OAuth flow and saves the returned native session. */
export async function signInWithGoogle() {
  const client = requireSupabase();
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw error;
  if (Platform.OS === 'web') return;
  if (!data.url) throw new Error('Google sign-in could not be started.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) return;
  if (!await completeAuthFromUrl(result.url)) throw new Error('Google sign-in did not return a session.');
  trackEvent('auth_completed', { provider: 'google' });
}

/** Apple requires the native entitlement/config plugin already included by the factory. */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is available on iOS.');
  const client = requireSupabase();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  const { error } = await client.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw error;
  trackEvent('auth_completed', { provider: 'apple' });
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

/**
 * The Edge Function must verify the caller's JWT and delete auth.uid() using
 * the server-only service-role client. A client must never hold that secret.
 */
export async function deleteCurrentAccount() {
  const client = requireSupabase();
  const { error } = await client.functions.invoke(env.supabaseDeleteAccountFunction, { method: 'POST' });
  if (error) throw error;
  const { error: signOutError } = await client.auth.signOut();
  if (signOutError) throw signOutError;
  trackEvent('account_deleted', {});
}
