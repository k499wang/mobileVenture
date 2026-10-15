export type AuthGateState = 'loading' | 'sign-in' | 'not-configured' | 'pass';

/** Pure decision for the post-onboarding auth gate (unit tested). */
export function authGateState({ required, configured, loading, signedIn, devBypass }: { required: boolean; configured: boolean; loading: boolean; signedIn: boolean; devBypass: boolean }): AuthGateState {
  if (!required || devBypass) return 'pass';
  if (!configured) return 'not-configured';
  if (loading) return 'loading';
  return signedIn ? 'pass' : 'sign-in';
}
