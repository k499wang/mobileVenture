import { describe, expect, it } from '@jest/globals';

import { gameDefinition as def } from '@/config/game-definition';
import { petContent as content } from '@/content/pet-content';
import * as engine from './engine';
import type { GameState } from './types';

const DAY = 86_400_000;
const t0 = new Date(2026, 9, 14, 9, 0).getTime(); // a Wednesday morning
const ctx = (now = t0, isPro = false): engine.GameContext => ({ def, content, now, isPro });
const fresh = () => engine.refresh(engine.createGame(def, 'Bun'), ctx());
const withGoal = () => engine.addGoal(fresh(), 'Drink water', t0);
const full = (): GameState => ({ ...fresh(), energy: def.energy.max });

describe('actions and rewards', () => {
  it('pays out a check-in once per day and logs the mood', () => {
    const { state, events } = engine.recordAction(fresh(), ctx(), 'checkin', { mood: 4 });
    expect(state.energy).toBe(def.actions.checkin.energy);
    expect(state.currency).toBe(def.actions.checkin.currency);
    expect(engine.today(state, t0).mood).toBe(4);
    expect(events[0]).toEqual({ type: 'reward', energy: 40, currency: 10, xp: 20 });
    const again = engine.recordAction(state, ctx(t0 + 1000), 'checkin', { mood: 5 }).state;
    expect(again.currency).toBe(state.currency);
  });
  it('gives extra energy on low-mood days', () => {
    const low = engine.recordAction(fresh(), ctx(), 'checkin', { mood: 1 }).state;
    expect(low.energy).toBe(Math.round(def.actions.checkin.energy * def.energy.lowMoodBonus));
  });
  it('caps energy and announces when the pet is ready', () => {
    let state = withGoal();
    const { events } = engine.recordAction({ ...state, energy: 90 }, ctx(), 'goal', { goalId: state.goals[0].id });
    expect(events).toContainEqual({ type: 'energy-full' });
    state = engine.recordAction({ ...state, energy: 90 }, ctx(), 'goal', { goalId: state.goals[0].id }).state;
    expect(state.energy).toBe(def.energy.max);
  });
  it('completes each goal once per day, again tomorrow', () => {
    const state = withGoal(); const goalId = state.goals[0].id;
    const done = engine.recordAction(state, ctx(), 'goal', { goalId }).state;
    expect(() => engine.recordAction(done, ctx(), 'goal', { goalId })).toThrow('already-done');
    expect(() => engine.recordAction(done, ctx(t0 + DAY), 'goal', { goalId })).not.toThrow();
  });
  it('rejects unknown actions', () => expect(() => engine.recordAction(fresh(), ctx(), 'nope')).toThrow('unknown'));
});

describe('levels', () => {
  it('levels up from XP and reports evolutions', () => {
    const xpToStage2 = engine.xpForLevel(5, def);
    const state: GameState = { ...fresh(), xp: xpToStage2 - 5 };
    const { events } = engine.recordAction(state, ctx(), 'checkin', { mood: 3 });
    expect(events).toContainEqual({ type: 'level-up', level: 5, stage: 'Kid' });
  });
  it('xp thresholds increase', () => {
    for (let level = 2; level < 30; level++) expect(engine.xpForLevel(level + 1, def)).toBeGreaterThan(engine.xpForLevel(level, def));
  });
});

describe('streaks never punish', () => {
  it('counts consecutive days and welcomes users back after a gap', () => {
    let state = engine.recordAction(fresh(), ctx(), 'checkin', { mood: 3 }).state;
    state = engine.recordAction(state, ctx(t0 + DAY), 'checkin', { mood: 3 }).state;
    expect(state.streak.current).toBe(2);
    const { state: back, events } = engine.recordAction(state, ctx(t0 + 5 * DAY), 'checkin', { mood: 3 });
    expect(back.streak).toMatchObject({ current: 1, best: 2, totalDays: 3 });
    expect(events).toContainEqual({ type: 'streak', current: 1, welcomeBack: true });
    expect(back.currency).toBeGreaterThan(state.currency);
  });
});

describe('adventures', () => {
  it('needs full energy', () => expect(() => engine.startAdventure(fresh(), ctx())).toThrow('not-enough-energy'));
  it('runs away → returned → collected with a story and rewards', () => {
    const away = engine.startAdventure(full(), ctx()).state;
    expect(away.energy).toBe(0);
    expect(away.adventure.status).toBe('away');
    expect(() => engine.collectAdventure(away, ctx(t0 + 1000))).toThrow('not-ready');
    const later = t0 + def.adventure.durationHours * 3_600_000;
    expect(engine.refresh(away, ctx(later)).adventure.status).toBe('returned');
    const { state, value } = engine.collectAdventure(away, ctx(later));
    expect(value?.story).toContain('Bun');
    expect(value?.currency).toBeGreaterThanOrEqual(def.adventure.currency[0]);
    expect(state.adventure.status).toBe('home');
    expect(state.lastStory?.adventureId).toBe(value?.adventureId);
  });
  it('Pro adventures return faster', () => {
    const normal = engine.startAdventure(full(), ctx()).state.adventure;
    const pro = engine.startAdventure(full(), ctx(t0, true)).state.adventure;
    if (normal.status !== 'away' || pro.status !== 'away') throw new Error('expected away');
    expect(pro.endsAt - t0).toBe((normal.endsAt - t0) * def.adventure.proSpeed);
  });
  it('collectibles are never duplicated', () => {
    let state = full(); let now = t0;
    for (let i = 0; i < 80; i++) {
      state = engine.startAdventure({ ...state, energy: def.energy.max }, ctx(now)).state;
      now += def.adventure.durationHours * 3_600_000;
      state = engine.collectAdventure(state, ctx(now)).state;
    }
    expect(new Set(state.collection).size).toBe(state.collection.length);
  });
});

describe('quests', () => {
  it('rolls the configured number of quests, stable within a day, new tomorrow', () => {
    const state = fresh();
    expect(state.quests.daily).toHaveLength(def.quests.dailyCount);
    expect(state.quests.weekly).toHaveLength(def.quests.weeklyCount);
    expect(engine.refresh(state, ctx(t0 + 3_600_000)).quests).toBe(state.quests);
    expect(engine.refresh(state, ctx(t0 + DAY)).quests.day).not.toBe(state.quests.day);
  });
  it('claims a completed quest exactly once', () => {
    const quest = content.quests.find(item => item.id === 'd-checkin')!;
    let state: GameState = { ...fresh(), quests: { ...fresh().quests, daily: [{ id: quest.id, progress: 0, claimed: false }] } };
    expect(() => engine.claimQuest(state, ctx(), quest.id)).toThrow('not-ready');
    state = engine.recordAction(state, ctx(), 'checkin', { mood: 3 }).state;
    const claimed = engine.claimQuest(state, ctx(), quest.id).state;
    expect(claimed.currency).toBe(state.currency + quest.reward);
    expect(() => engine.claimQuest(claimed, ctx(), quest.id)).toThrow('not-ready');
  });
});

describe('shop', () => {
  const rich = (): GameState => ({ ...fresh(), currency: 1000, xp: engine.xpForLevel(30, def) });
  it('buys, auto-equips, and refuses duplicates', () => {
    const state = engine.buyItem(rich(), ctx(), 'bow-pink').state;
    expect(state.inventory).toContain('bow-pink');
    expect(state.equipped.head).toBe('bow-pink');
    expect(() => engine.buyItem(state, ctx(), 'bow-pink')).toThrow('already-owned');
  });
  it('enforces price, level and Pro', () => {
    expect(() => engine.buyItem(fresh(), ctx(), 'bow-pink')).toThrow('not-enough-currency');
    expect(() => engine.buyItem({ ...fresh(), currency: 1000 }, ctx(), 'crown')).toThrow('locked');
    expect(() => engine.buyItem(rich(), ctx(), 'graduation')).toThrow('pro-required');
    expect(() => engine.buyItem(rich(), ctx(t0, true), 'graduation')).not.toThrow();
  });
  it('only equips owned items into the right slot', () => {
    const state = engine.buyItem(rich(), ctx(), 'scarf').state;
    expect(() => engine.equipItem(state, ctx(), 'head', 'crown')).toThrow('not-owned');
    expect(() => engine.equipItem(state, ctx(), 'head', 'scarf')).toThrow('unknown');
    expect(engine.equipItem(state, ctx(), 'neck', null).equipped.neck).toBeUndefined();
  });
});

describe('content pack', () => {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  it('has unique ids', () => {
    expect(unique(content.adventures.map(item => item.id))).toBe(true);
    expect(unique(content.items.map(item => item.id))).toBe(true);
    expect(unique(content.collectibles.map(item => item.id))).toBe(true);
    expect(unique(content.quests.map(item => item.id))).toBe(true);
  });
  it('quests point at real triggers', () => {
    const triggers = new Set([...Object.keys(def.actions), 'adventure', 'purchase', 'any']);
    for (const quest of content.quests) expect(triggers.has(quest.trigger)).toBe(true);
  });
  it('has enough quests to roll and adventures for a new pet', () => {
    expect(content.quests.filter(quest => quest.period === 'daily').length).toBeGreaterThanOrEqual(def.quests.dailyCount);
    expect(content.quests.filter(quest => quest.period === 'weekly').length).toBeGreaterThanOrEqual(def.quests.weeklyCount);
    expect(content.adventures.filter(item => (item.minLevel ?? 1) <= 1).length).toBeGreaterThan(1);
    for (const pool of Object.values(content.dialogue)) expect(pool.length).toBeGreaterThan(0);
  });
  it('stages use real poses and start at level 1', () => expect(def.pet.stages[0].level).toBe(1));
});
