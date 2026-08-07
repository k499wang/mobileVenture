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
