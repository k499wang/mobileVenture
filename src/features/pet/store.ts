import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { gameDefinition } from '@/config/game-definition';
import { petContent } from '@/content/pet-content';
import { trackEvent } from '@/services/analytics';
import { reportError } from '@/services/errors';
import { readAppData, saveAppData } from '@/services/user-data';
import { useAppStore } from '@/store/app-store';
import { useOnboardingStore } from '@/store/onboarding-store';
import * as engine from './engine';
import type { AdventureResult, GameEvent, GameResult, GameState, ItemSlot, Mood } from './types';

const context = (): engine.GameContext => ({ def: gameDefinition, content: petContent, now: Date.now(), isPro: useAppStore.getState().isPro });

type PetStore = {
  game: GameState | null;
  /** Events waiting to be celebrated by the UI (level ups, quest completions). */
  pending: GameEvent[];
  /** Story shown after collecting an adventure. */
  story: AdventureResult | null;
  ensureGame: () => GameState;
  refresh: () => void;
  checkIn: (mood: Mood) => void;
  completeGoal: (goalId: string) => void;
  /** Any app-defined action from gameDefinition.actions, e.g. logAction('log_drink'). */
  logAction: (actionId: string) => void;
  startAdventure: () => void;
  collectAdventure: () => void;
  claimQuest: (questId: string) => void;
  buyItem: (itemId: string) => void;
  equip: (slot: ItemSlot, itemId: string | null) => void;
  addGoal: (title: string) => void;
  removeGoal: (goalId: string) => void;
  rename: (name: string) => void;
  dismissEvent: () => void;
  dismissStory: () => void;
};

let syncTimer: ReturnType<typeof setTimeout> | undefined;
/** Local-first; mirrors to Supabase via user-data for signed-in users. */
function scheduleCloudSync(game: GameState) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void readAppData().then(data => saveAppData({ ...data, pet: game })).catch(error => reportError(error, 'pet.cloud-sync'));
  }, 2000);
}

async function scheduleReturnNotification(game: GameState) {
  if (game.adventure.status !== 'away') return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  const seconds = Math.max(60, Math.round((game.adventure.endsAt - Date.now()) / 1000));
  await Notifications.scheduleNotificationAsync({
    content: { title: `${game.petName} is home!`, body: 'Come hear about the adventure.', sound: false },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}

function trackEvents(events: GameEvent[]) {
  for (const event of events) {
    if (event.type === 'level-up') trackEvent('pet_level_up', { level: event.level });
    if (event.type === 'quest-complete') trackEvent('quest_completed', { questId: event.questId });
  }
}

export const usePetStore = create<PetStore>()(persist((set, get) => {
  /** Run an engine call; GameErrors propagate so screens can explain them. */
  function apply<T>(run: (game: GameState, ctx: engine.GameContext) => GameResult<T>) {
    const result = run(get().ensureGame(), context());
    const celebrate = result.events.filter(event => event.type === 'level-up' || event.type === 'quest-complete' || (event.type === 'streak' && event.welcomeBack));
    set({ game: result.state, pending: [...get().pending, ...celebrate] });
    trackEvents(result.events);
    scheduleCloudSync(result.state);
    return result;
  }
  return {
    game: null, pending: [], story: null,
    ensureGame: () => {
      const existing = get().game;
      if (existing) return existing;
      const nameKey = gameDefinition.pet.nameAnswerKey;
      const answer = nameKey ? useOnboardingStore.getState().answers[nameKey] : undefined;
      const game = engine.createGame(gameDefinition, typeof answer === 'string' ? answer : undefined);
      set({ game });
      return game;
    },
    refresh: () => { const game = engine.refresh(get().ensureGame(), context()); set({ game }); },
    checkIn: mood => {
      apply((game, ctx) => engine.recordAction(game, ctx, 'checkin', { mood }));
      trackEvent('core_action_completed', { action: 'checkin' });
    },
    completeGoal: goalId => {
      apply((game, ctx) => engine.recordAction(game, ctx, 'goal', { goalId }));
      trackEvent('core_action_completed', { action: 'goal' });
    },
    logAction: actionId => {
      apply((game, ctx) => engine.recordAction(game, ctx, actionId));
      trackEvent('core_action_completed', { action: actionId });
    },
    startAdventure: () => {
      const { state } = apply((game, ctx) => engine.startAdventure(game, ctx));
      trackEvent('adventure_started', {});
      void scheduleReturnNotification(state).catch(error => reportError(error, 'pet.notification'));
    },
    collectAdventure: () => {
      const { value } = apply((game, ctx) => engine.collectAdventure(game, ctx));
      if (value) { set({ story: value }); trackEvent('adventure_collected', { found: Boolean(value.collectibleId) }); }
    },
    claimQuest: questId => { apply((game, ctx) => engine.claimQuest(game, ctx, questId)); },
    buyItem: itemId => { apply((game, ctx) => engine.buyItem(game, ctx, itemId)); trackEvent('item_purchased', { itemId }); },
    equip: (slot, itemId) => { const game = engine.equipItem(get().ensureGame(), context(), slot, itemId); set({ game }); scheduleCloudSync(game); },
    addGoal: title => { const game = engine.addGoal(get().ensureGame(), title, Date.now()); set({ game }); scheduleCloudSync(game); },
    removeGoal: goalId => { const game = engine.removeGoal(get().ensureGame(), goalId); set({ game }); scheduleCloudSync(game); },
    rename: name => { const game = engine.renamePet(get().ensureGame(), name); set({ game }); scheduleCloudSync(game); },
    dismissEvent: () => set({ pending: get().pending.slice(1) }),
    dismissStory: () => set({ story: null }),
  };
}, {
  name: 'pet-game', storage: createJSONStorage(() => AsyncStorage),
  partialize: ({ game }) => ({ game }),
}));
