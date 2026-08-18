import { describe, expect, it } from '@jest/globals';

import { gameDefinition as def } from '@/config/game-definition';
import { petContent as content } from '@/content/pet-content';
import * as engine from './engine';

const DAY = 86_400_000;
const t0 = new Date(2026, 9, 14, 9, 0).getTime(); // a Wednesday morning
const ctx = (now = t0, isPro = false): engine.GameContext => ({ def, content, now, isPro });
const fresh = () => engine.refresh(engine.createGame(def, 'Bun'), ctx());

describe('calendar keys', () => {
  it('formats local days and starts weeks on Monday', () => {
    expect(engine.dayKey(t0)).toBe('2026-10-14');
    expect(engine.weekKey(t0)).toBe('2026-10-12');
    expect(engine.weekKey(new Date(2026, 9, 18, 23).getTime())).toBe('2026-10-12');
    expect(engine.weekKey(new Date(2026, 9, 19, 0).getTime())).toBe('2026-10-19');
  });
});

describe('seeded', () => {
  it('is deterministic per seed and stays within [0, 1)', () => {
    const a = engine.seeded('day:1'); const b = engine.seeded('day:1'); const c = engine.seeded('day:2');
    const first = Array.from({ length: 20 }, a);
    expect(first).toEqual(Array.from({ length: 20 }, b));
    expect(first).not.toEqual(Array.from({ length: 20 }, c));
    expect(first.every(value => value >= 0 && value < 1)).toBe(true);
  });
});

describe('levels', () => {
  it('levelFor is the inverse of xpForLevel at every threshold', () => {
    for (let level = 1; level <= 30; level++) {
      const xp = engine.xpForLevel(level, def);
      expect(engine.levelFor(xp, def)).toBe(level);
      if (level > 1) expect(engine.levelFor(xp - 1, def)).toBe(level - 1);
    }
  });
  it('levelProgress ratio stays within [0, 1)', () => {
    for (const xp of [0, 1, 37, 250, 999, 5000]) {
      const progress = engine.levelProgress({ ...fresh(), xp }, def);
      expect(progress.ratio).toBeGreaterThanOrEqual(0);
      expect(progress.ratio).toBeLessThan(1);
      expect(progress.current).toBeLessThan(progress.needed);
    }
  });
  it('stageFor picks the highest unlocked stage regardless of config order', () => {
    const shuffled = { ...def, pet: { ...def.pet, stages: [...def.pet.stages].reverse() } };
    for (let level = 1; level <= 40; level += 3) expect(engine.stageFor(level, shuffled).name).toBe(engine.stageFor(level, def).name);
    expect(engine.stageFor(1, def).level).toBe(1);
  });
});

describe('refresh', () => {
  it('keeps only the 60 most recent day logs', () => {
    const days = Object.fromEntries(Array.from({ length: 75 }, (_, i) => [engine.dayKey(t0 - i * DAY), { actions: {}, goalsDone: [] }]));
    const next = engine.refresh({ ...fresh(), days }, ctx());
    const keys = Object.keys(next.days).sort();
    expect(keys).toHaveLength(60);
    expect(keys.at(-1)).toBe(engine.dayKey(t0));
    expect(keys[0]).toBe(engine.dayKey(t0 - 59 * DAY));
  });
});

describe('goals and naming', () => {
  it('trims goal titles and ignores blank ones', () => {
    const state = engine.addGoal(fresh(), '  Walk  ', t0);
    expect(state.goals.map(goal => goal.title)).toEqual(['Walk']);
    expect(engine.addGoal(state, '   ', t0)).toBe(state);
  });
});
