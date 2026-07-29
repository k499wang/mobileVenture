import { describe, expect, it } from '@jest/globals';

import { authGateState } from './logic';

const base = { required: true, configured: true, loading: false, signedIn: false, devBypass: false };
describe('authGateState', () => {
  it('passes when sign-in is not required', () => expect(authGateState({ ...base, required: false })).toBe('pass'));
  it('asks signed-out users to sign in', () => expect(authGateState(base)).toBe('sign-in'));
  it('passes signed-in users', () => expect(authGateState({ ...base, signedIn: true })).toBe('pass'));
  it('waits for the session to load', () => expect(authGateState({ ...base, loading: true })).toBe('loading'));
  it('reports missing Supabase config', () => expect(authGateState({ ...base, configured: false })).toBe('not-configured'));
  it('allows the dev bypass', () => expect(authGateState({ ...base, configured: false, devBypass: true })).toBe('pass'));
  it('lets the dev bypass skip a loading session', () => expect(authGateState({ ...base, loading: true, devBypass: true })).toBe('pass'));
  it('reports missing config before waiting on a session', () => expect(authGateState({ ...base, configured: false, loading: true })).toBe('not-configured'));
});
