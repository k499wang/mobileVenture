import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { GlassButton, GlassCard, GlassInput, useGlassPalette } from '@/components/glass';
import { useAuthSession } from '@/hooks/use-auth-session';
import { signInWithApple, signInWithEmail, signInWithGoogle, signOut } from '@/services/auth';

export function AuthCard({ color }: { color: string }) {
  const palette = useGlassPalette();
  const { session, configured, loading } = useAuthSession();
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false);
  if (!configured) return <GlassCard><Text style={[styles.title, { color: palette.text }]}>Account</Text><Text style={[styles.copy, { color: palette.muted }]}>Sign-in becomes available when Supabase keys are configured.</Text></GlassCard>;
  if (loading) return <GlassCard><Text style={[styles.copy, { color: palette.muted }]}>Checking your account…</Text></GlassCard>;
  async function run(action: () => Promise<unknown>, success?: string) {
    setWorking(true);
    try { await action(); if (success) Alert.alert(success); }
    catch (error) { Alert.alert('Unable to continue', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }
  if (session) return <GlassCard><Text style={[styles.title, { color: palette.text }]}>Signed in</Text><Text style={[styles.copy, { color: palette.muted }]}>{session.user.email ?? 'Your account is connected.'}</Text><GlassButton color={color} disabled={working} onPress={() => void run(signOut)}><Text style={styles.button}>Sign out</Text></GlassButton></GlassCard>;
  return <GlassCard><Text style={[styles.title, { color: palette.text }]}>Save your progress</Text><Text style={[styles.copy, { color: palette.muted }]}>Create an account to keep your subscription and data across devices.</Text><GlassInput value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" /><GlassButton color={color} disabled={working || !email.includes('@')} onPress={() => void run(() => signInWithEmail(email.trim()), 'Check your email for a secure sign-in link.')}><Text style={styles.button}>Email me a sign-in link</Text></GlassButton><View style={styles.row}>{Platform.OS === 'ios' ? <GlassButton color="#111111" disabled={working} onPress={() => void run(signInWithApple)}><Text style={styles.button}>Continue with Apple</Text></GlassButton> : null}<GlassButton color="#4285F4" disabled={working} onPress={() => void run(signInWithGoogle)}><Text style={styles.button}>Continue with Google</Text></GlassButton></View></GlassCard>;
}

const styles = StyleSheet.create({ title: { color: '#19191F', fontSize: 18, fontWeight: '700' }, copy: { color: '#686875', fontSize: 14, lineHeight: 20 }, button: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, row: { gap: 10 } });
