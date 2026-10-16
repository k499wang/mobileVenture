import type { MascotPose } from '@/components/mascot';

/** Things the user does in real life. Apps add their own action ids in game-definition.ts. */
export type ActionReward = { energy: number; currency: number; xp: number; /** Max rewarded per day; further logs still count for quests. */ dailyLimit?: number };

export type GameDefinition = {
  enabled: boolean;
  pet: {
    defaultName: string;
    /** Onboarding answer key that names the pet, e.g. a text step with answerKey 'petName'. */
    nameAnswerKey?: string;
    /** Growth stages. The highest stage whose `level` ≤ pet level is shown. */
    stages: readonly { level: number; name: string; pose: MascotPose }[];
  };
  currency: { name: string; icon: string };
  energy: { max: number; /** Multiplier on energy for low-mood check-ins (Finch-style: bad days still count). */ lowMoodBonus: number };
  actions: Record<string, ActionReward>;
  xp: { base: number; exponent: number };
  adventure: { durationHours: number; currency: readonly [number, number]; xp: number; collectibleChance: number; /** Pro: duration multiplier (0.5 = twice as fast). */ proSpeed: number; proCurrencyBonus: number };
  quests: { dailyCount: number; weeklyCount: number };
};

export type Mood = 1 | 2 | 3 | 4 | 5;
export type ItemSlot = 'head' | 'face' | 'neck' | 'room';
/** An action id from `actions`, or 'adventure', 'purchase', or 'any' (any action). */
export type QuestTrigger = string;

export type PetContent = {
  adventures: readonly { id: string; place: string; story: string; minLevel?: number }[];
  /** Random twist added to an adventure story. */
  encounters: readonly string[];
  items: readonly { id: string; name: string; slot: ItemSlot; emoji: string; price: number; premium?: boolean; minLevel?: number }[];
  collectibles: readonly { id: string; name: string; emoji: string; rarity: 'common' | 'rare' | 'legendary'; description: string }[];
  quests: readonly { id: string; period: 'daily' | 'weekly'; title: string; trigger: QuestTrigger; target: number; reward: number }[];
  dialogue: { greeting: readonly string[]; lowMood: readonly string[]; happy: readonly string[]; away: readonly string[]; returned: readonly string[]; levelUp: readonly string[] };
};

export type Goal = { id: string; title: string; createdAt: string };
export type QuestProgress = { id: string; progress: number; claimed: boolean };

export type AdventureState =
  | { status: 'home' }
  | { status: 'away'; adventureId: string; startedAt: number; endsAt: number }
  | { status: 'returned'; adventureId: string; endsAt: number };

export type AdventureResult = { adventureId: string; place: string; story: string; encounter: string; currency: number; collectibleId?: string; xp: number };

export type GameState = {
  version: 1;
  petName: string;
  xp: number;
  energy: number;
  currency: number;
  goals: Goal[];
  /** Per-day log, keyed YYYY-MM-DD. Only recent days are kept. */
  days: Record<string, { mood?: Mood; actions: Record<string, number>; goalsDone: string[] }>;
  streak: { current: number; best: number; totalDays: number; lastDay: string | null };
  adventure: AdventureState;
  /** The most recent story, kept so the user can reread it. */
  lastStory: AdventureResult | null;
  inventory: string[];
  equipped: Partial<Record<ItemSlot, string>>;
  collection: string[];
  quests: { day: string; week: string; daily: QuestProgress[]; weekly: QuestProgress[] };
};

/** Every engine function returns new state plus events the UI can celebrate. */
export type GameEvent =
  | { type: 'reward'; energy: number; currency: number; xp: number }
  | { type: 'level-up'; level: number; stage?: string }
  | { type: 'energy-full' }
  | { type: 'streak'; current: number; welcomeBack: boolean }
  | { type: 'quest-complete'; questId: string };

export type GameResult<T = undefined> = { state: GameState; events: GameEvent[]; value?: T };
