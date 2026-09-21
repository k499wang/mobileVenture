import { appDefinition } from '@/config/app-definition';
import type { Answers } from '@/config/app-definition-types';
import { supabase } from '@/lib/supabase';

/** Persist non-sensitive onboarding answers only after a user has authenticated. */
export async function saveOnboardingToCloud(answers: Answers) {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('onboarding_answers').upsert({
    app_id: appDefinition.id,
    user_id: user.id,
    version: appDefinition.onboardingVersion,
    answers,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Local answers win after an in-progress anonymous session; otherwise hydrate from RLS-protected cloud data. */
export async function syncOnboardingFromCloud() {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // This dynamic import avoids a store/service initialization cycle.
  const { useOnboardingStore } = await import('@/store/onboarding-store');
  const state = useOnboardingStore.getState();
  if (Object.keys(state.answers).length > 0) {
    await saveOnboardingToCloud(state.answers);
    return;
  }
  const { data, error } = await supabase.from('onboarding_answers')
    .select('answers, version')
    .eq('app_id', appDefinition.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data?.version === appDefinition.onboardingVersion && data.answers && typeof data.answers === 'object') {
    useOnboardingStore.setState({ answers: data.answers as Answers });
  }
}
