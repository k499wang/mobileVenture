import { supabase } from '@/lib/supabase';
import { setPurchaseUser } from './purchases';
import { reportError } from './errors';

/** Subscribe once at the provider. Supabase emits INITIAL_SESSION on registration. */
export function subscribeIdentity(clearUserData: () => void) {
  if (!supabase) return () => undefined;
  let current: string | null | undefined;
  let disposed = false;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    if (next === current) return;
    current = next;
    clearUserData();
    // Keep SDK work outside Supabase's auth callback/lock.
    setTimeout(() => {
      if (!disposed) void setPurchaseUser(next).catch(error => reportError(error, 'identity.sync'));
    }, 0);
  });
  return () => { disposed = true; data.subscription.unsubscribe(); };
}
