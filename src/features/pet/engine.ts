import type { AdventureResult, GameDefinition, GameEvent, GameResult, GameState, ItemSlot, Mood, PetContent, QuestProgress } from './types';

/**
 * Pure game rules. No React, storage, or clock: callers pass `now`, so every
 * function is deterministic and unit tested. UI and persistence live in store.ts.
 */
export type GameContext = { def: GameDefinition; content: PetContent; now: number; isPro: boolean };
export type GameErrorCode = 'not-enough-energy' | 'not-enough-currency' | 'pro-required' | 'already-owned' | 'not-owned' | 'locked' | 'not-ready' | 'already-done' | 'unknown';
export class GameError extends Error {
  constructor(public code: GameErrorCode) { super(code); }
}

// ---------- time & randomness ----------
const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(now: number) { const d = new Date(now); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** The Monday that starts this week, as a day key. */
export function weekKey(now: number) { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d.getTime()); }
function previousDay(day: string) { const [y, m, d] = day.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1).getTime()); }

/** Seeded PRNG so a given day/adventure always rolls the same result. */
export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pick<T>(items: readonly T[], random: () => number): T { return items[Math.floor(random() * items.length)]; }
function pickMany<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items]; const out: T[] = [];
  while (pool.length && out.length < count) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

// ---------- levels ----------
/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number, def: GameDefinition) { return level <= 1 ? 0 : Math.round(def.xp.base * Math.pow(level - 1, def.xp.exponent)); }
export function levelFor(xp: number, def: GameDefinition) { let level = 1; while (xpForLevel(level + 1, def) <= xp) level++; return level; }
export function levelProgress(state: GameState, def: GameDefinition) {
  const level = levelFor(state.xp, def); const start = xpForLevel(level, def); const end = xpForLevel(level + 1, def);
  return { level, current: state.xp - start, needed: end - start, ratio: (state.xp - start) / (end - start) };
}
export function stageFor(level: number, def: GameDefinition) {
  return [...def.pet.stages].sort((a, b) => b.level - a.level).find(stage => stage.level <= level) ?? def.pet.stages[0];
}
function addXp(state: GameState, amount: number, def: GameDefinition, events: GameEvent[]): GameState {
  const before = levelFor(state.xp, def); const xp = state.xp + amount; const after = levelFor(xp, def);
  for (let level = before + 1; level <= after; level++) {
    const stage = stageFor(level, def); const previous = stageFor(level - 1, def);
    events.push({ type: 'level-up', level, stage: stage.name !== previous.name ? stage.name : undefined });
  }
  return { ...state, xp };
}

// ---------- state ----------
export function createGame(def: GameDefinition, petName?: string): GameState {
  return {
    version: 1, petName: petName?.trim() || def.pet.defaultName, xp: 0, energy: 0, currency: 0, goals: [], days: {},
    streak: { current: 0, best: 0, totalDays: 0, lastDay: null }, adventure: { status: 'home' }, lastStory: null,
    inventory: [], equipped: {}, collection: [], quests: { day: '', week: '', daily: [], weekly: [] },
  };
}

/** Call before reading or changing state: rolls new quests, returns pets home, trims old logs. */
export function refresh(state: GameState, ctx: GameContext): GameState {
  const day = dayKey(ctx.now); const week = weekKey(ctx.now);
  let next = state;
  if (next.quests.day !== day || next.quests.week !== week) {
    const roll = (period: 'daily' | 'weekly', key: string, count: number): QuestProgress[] =>
      pickMany(ctx.content.quests.filter(quest => quest.period === period), count, seeded(`${period}:${key}:${state.petName}`)).map(quest => ({ id: quest.id, progress: 0, claimed: false }));
    next = { ...next, quests: {
      day, week,
      daily: next.quests.day === day ? next.quests.daily : roll('daily', day, ctx.def.quests.dailyCount),
      weekly: next.quests.week === week ? next.quests.weekly : roll('weekly', week, ctx.def.quests.weeklyCount),
    } };
  }
  if (next.adventure.status === 'away' && ctx.now >= next.adventure.endsAt) {
    next = { ...next, adventure: { status: 'returned', adventureId: next.adventure.adventureId, endsAt: next.adventure.endsAt } };
  }
  const keys = Object.keys(next.days);
  if (keys.length > 60) next = { ...next, days: Object.fromEntries(keys.sort().slice(-60).map(key => [key, next.days[key]])) };
  return next;
}

function progressQuests(state: GameState, ctx: GameContext, trigger: string, events: GameEvent[]): GameState {
  const bump = (list: QuestProgress[]) => list.map(entry => {
    const quest = ctx.content.quests.find(item => item.id === entry.id);
    if (!quest || entry.claimed || entry.progress >= quest.target || (quest.trigger !== trigger && quest.trigger !== 'any')) return entry;
    const progress = entry.progress + 1;
    if (progress === quest.target) events.push({ type: 'quest-complete', questId: quest.id });
    return { ...entry, progress };
  });
  return { ...state, quests: { ...state.quests, daily: bump(state.quests.daily), weekly: bump(state.quests.weekly) } };
}

/** A gentle streak: missing days never removes anything, it only restarts the count with a welcome back. */
function markActiveDay(state: GameState, day: string, events: GameEvent[]): GameState {
  const { streak } = state;
  if (streak.lastDay === day) return state;
  const continued = streak.lastDay === previousDay(day);
  const current = continued ? streak.current + 1 : 1;
  events.push({ type: 'streak', current, welcomeBack: streak.lastDay !== null && !continued });
  return { ...state, streak: { current, best: Math.max(streak.best, current), totalDays: streak.totalDays + 1, lastDay: day } };
}

// ---------- actions ----------
/** Log a real-life action (check-in, goal, or any app-defined action) and pay out its reward. */
export function recordAction(input: GameState, ctx: GameContext, actionId: string, options: { mood?: Mood; goalId?: string } = {}): GameResult {
  const reward = ctx.def.actions[actionId];
  if (!reward) throw new GameError('unknown');
  const events: GameEvent[] = [];
  let state = refresh(input, ctx);
  const day = dayKey(ctx.now);
  const log = state.days[day] ?? { actions: {}, goalsDone: [] };
  if (options.goalId) {
    if (!state.goals.some(goal => goal.id === options.goalId)) throw new GameError('unknown');
    if (log.goalsDone.includes(options.goalId)) throw new GameError('already-done');
  }
  const count = log.actions[actionId] ?? 0;
  const rewarded = reward.dailyLimit === undefined || count < reward.dailyLimit;
  state = { ...state, days: { ...state.days, [day]: {
    mood: options.mood ?? log.mood,
    actions: { ...log.actions, [actionId]: count + 1 },
    goalsDone: options.goalId ? [...log.goalsDone, options.goalId] : log.goalsDone,
  } } };
  state = markActiveDay(state, day, events);
  if (rewarded) {
    const multiplier = options.mood !== undefined && options.mood <= 2 ? ctx.def.energy.lowMoodBonus : 1;
    const energyGain = Math.round(reward.energy * multiplier);
    const wasFull = state.energy >= ctx.def.energy.max;
    state = { ...state, energy: Math.min(ctx.def.energy.max, state.energy + energyGain), currency: state.currency + reward.currency };
    state = addXp(state, reward.xp, ctx.def, events);
    events.unshift({ type: 'reward', energy: energyGain, currency: reward.currency, xp: reward.xp });
    if (!wasFull && state.energy >= ctx.def.energy.max && state.adventure.status === 'home') events.push({ type: 'energy-full' });
  }
  state = progressQuests(state, ctx, actionId, events);
  return { state, events };
}

export function startAdventure(input: GameState, ctx: GameContext): GameResult {
  const state = refresh(input, ctx);
  if (state.adventure.status !== 'home') throw new GameError('not-ready');
  if (state.energy < ctx.def.energy.max) throw new GameError('not-enough-energy');
  const level = levelFor(state.xp, ctx.def);
  const options = ctx.content.adventures.filter(item => (item.minLevel ?? 1) <= level && item.id !== state.lastStory?.adventureId);
  const adventure = pick(options.length ? options : ctx.content.adventures, seeded(`adventure:${ctx.now}`));
  const duration = ctx.def.adventure.durationHours * 3_600_000 * (ctx.isPro ? ctx.def.adventure.proSpeed : 1);
  return { state: { ...state, energy: 0, adventure: { status: 'away', adventureId: adventure.id, startedAt: ctx.now, endsAt: ctx.now + duration } }, events: [] };
}

export function collectAdventure(input: GameState, ctx: GameContext): GameResult<AdventureResult> {
  let state = refresh(input, ctx);
  if (state.adventure.status !== 'returned') throw new GameError('not-ready');
  const { adventureId, endsAt } = state.adventure;
  const adventure = ctx.content.adventures.find(item => item.id === adventureId) ?? ctx.content.adventures[0];
  const random = seeded(`collect:${adventureId}:${endsAt}`);
  const [min, max] = ctx.def.adventure.currency;
  const currency = Math.round((min + random() * (max - min)) * (ctx.isPro ? ctx.def.adventure.proCurrencyBonus : 1));
  const missing = ctx.content.collectibles.filter(item => !state.collection.includes(item.id));
  const weights = { common: 6, rare: 3, legendary: 1 } as const;
  let collectibleId: string | undefined;
  if (missing.length && random() < ctx.def.adventure.collectibleChance) {
    let roll = random() * missing.reduce((sum, item) => sum + weights[item.rarity], 0);
    collectibleId = missing.find(item => (roll -= weights[item.rarity]) < 0)?.id ?? missing[0].id;
  }
  const result: AdventureResult = { adventureId, place: adventure.place, story: adventure.story.replaceAll('{{pet}}', state.petName), encounter: pick(ctx.content.encounters, random).replaceAll('{{pet}}', state.petName), currency, collectibleId, xp: ctx.def.adventure.xp };
  const events: GameEvent[] = [{ type: 'reward', energy: 0, currency, xp: result.xp }];
  state = { ...state, currency: state.currency + currency, collection: collectibleId ? [...state.collection, collectibleId] : state.collection, adventure: { status: 'home' }, lastStory: result };
  state = addXp(state, result.xp, ctx.def, events);
  state = progressQuests(state, ctx, 'adventure', events);
  return { state, events, value: result };
}

export function claimQuest(input: GameState, ctx: GameContext, questId: string): GameResult {
  const state = refresh(input, ctx);
  const quest = ctx.content.quests.find(item => item.id === questId);
  const list = quest?.period === 'weekly' ? 'weekly' : 'daily';
  const entry = state.quests[list].find(item => item.id === questId);
  if (!quest || !entry || entry.claimed || entry.progress < quest.target) throw new GameError('not-ready');
  return { state: { ...state, currency: state.currency + quest.reward, quests: { ...state.quests, [list]: state.quests[list].map(item => item.id === questId ? { ...item, claimed: true } : item) } }, events: [{ type: 'reward', energy: 0, currency: quest.reward, xp: 0 }] };
}

export function buyItem(input: GameState, ctx: GameContext, itemId: string): GameResult {
  const events: GameEvent[] = [];
  let state = refresh(input, ctx);
  const item = ctx.content.items.find(entry => entry.id === itemId);
  if (!item) throw new GameError('unknown');
  if (state.inventory.includes(itemId)) throw new GameError('already-owned');
  if (item.premium && !ctx.isPro) throw new GameError('pro-required');
  if ((item.minLevel ?? 1) > levelFor(state.xp, ctx.def)) throw new GameError('locked');
  if (state.currency < item.price) throw new GameError('not-enough-currency');
  state = { ...state, currency: state.currency - item.price, inventory: [...state.inventory, itemId], equipped: { ...state.equipped, [item.slot]: itemId } };
  state = progressQuests(state, ctx, 'purchase', events);
  return { state, events };
}

/** Equip an owned item, or pass null to clear a slot. */
export function equipItem(state: GameState, ctx: GameContext, slot: ItemSlot, itemId: string | null): GameState {
  if (itemId && !state.inventory.includes(itemId)) throw new GameError('not-owned');
  if (itemId && ctx.content.items.find(item => item.id === itemId)?.slot !== slot) throw new GameError('unknown');
  return { ...state, equipped: { ...state.equipped, [slot]: itemId ?? undefined } };
}

export function addGoal(state: GameState, title: string, now: number): GameState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  return { ...state, goals: [...state.goals, { id: `goal-${now.toString(36)}-${state.goals.length}`, title: trimmed, createdAt: new Date(now).toISOString() }] };
}
export function removeGoal(state: GameState, goalId: string): GameState { return { ...state, goals: state.goals.filter(goal => goal.id !== goalId) }; }
export function renamePet(state: GameState, name: string): GameState { return name.trim() ? { ...state, petName: name.trim() } : state; }

// ---------- derived view data ----------
export function today(state: GameState, now: number) { return state.days[dayKey(now)] ?? { mood: undefined, actions: {}, goalsDone: [] }; }

/** A line for the pet's speech bubble; changes each hour, reacts to state. */
export function petLine(state: GameState, ctx: GameContext) {
  const { dialogue } = ctx.content;
  const mood = today(state, ctx.now).mood;
  const pool = state.adventure.status === 'away' ? dialogue.away
    : state.adventure.status === 'returned' ? dialogue.returned
    : mood !== undefined && mood <= 2 ? dialogue.lowMood
    : mood !== undefined ? dialogue.happy : dialogue.greeting;
  return pick(pool, seeded(`line:${Math.floor(ctx.now / 3_600_000)}`)).replaceAll('{{pet}}', state.petName);
}
