import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { gameDefinition } from '@/config/game-definition';
import { t } from '@/i18n';
import { requirePro } from '@/services/entitlements';
import { reportError } from '@/services/errors';
import { createGame, GameError } from './engine';
import { usePetStore } from './store';

/** Current game state, refreshed on mount, foreground, and every 30s (adventure timers, new days). */
export function useGame() {
  const game = usePetStore(state => state.game);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Never create a game before saved state loads, or a fresh one could overwrite it.
    const tick = () => { setNow(Date.now()); if (usePetStore.persist.hasHydrated()) usePetStore.getState().refresh(); };
    tick();
    const unsubscribeHydration = usePetStore.persist.onFinishHydration(tick);
    const timer = setInterval(tick, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); subscription.remove(); unsubscribeHydration(); };
  }, []);
  // Before the first refresh (or storage hydration) show a fresh game; the effect creates the real one.
  return { game: game ?? createGame(gameDefinition), now };
}

/** Run a store action and turn GameErrors into friendly messages (or the paywall for Pro items). */
export function runGameAction(action: () => void, retryAfterPro?: () => void) {
  try { action(); }
  catch (error) {
    if (error instanceof GameError) {
      if (error.code === 'pro-required') { void requirePro('pet_premium_item').then(unlocked => { if (unlocked) runGameAction(retryAfterPro ?? action); }); return; }
      const key = `pet.error.${error.code}`;
      const known = ['not-enough-energy', 'not-enough-currency', 'locked', 'already-done'].includes(error.code);
      Alert.alert(t(known ? key : 'pet.error.generic', { currency: gameDefinition.currency.name }));
      return;
    }
    reportError(error, 'pet.action');
    Alert.alert(t('pet.error.generic'));
  }
}

export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
