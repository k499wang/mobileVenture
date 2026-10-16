import type { GameDefinition } from '@/features/pet/types';

/**
 * Pet/game tuning. Set `enabled: false` for apps without a pet: Home shows the
 * plain feature screen and you can drop the Shop tab. Content (stories, items,
 * quests, dialogue) lives in src/content/pet-content.ts.
 */
export const gameDefinition = {
  enabled: true,
  pet: {
    defaultName: 'Bun',
    nameAnswerKey: 'petName',
    stages: [
      { level: 1, name: 'Baby', pose: 'sit' },
      { level: 5, name: 'Kid', pose: 'smile' },
      { level: 12, name: 'Teen', pose: 'happy' },
      { level: 25, name: 'Adult', pose: 'cheer' },
    ],
  },
  currency: { name: 'Carrots', icon: '🥕' },
  energy: { max: 100, lowMoodBonus: 1.5 },
  // Add your app's action here (e.g. log_drink, drink_water) and call `logAction('id')`.
  actions: {
    checkin: { energy: 40, currency: 10, xp: 20, dailyLimit: 1 },
    goal: { energy: 25, currency: 5, xp: 10, dailyLimit: 8 },
  },
  xp: { base: 60, exponent: 1.35 },
  adventure: { durationHours: 4, currency: [15, 35], xp: 30, collectibleChance: 0.45, proSpeed: 0.5, proCurrencyBonus: 1.5 },
  quests: { dailyCount: 3, weeklyCount: 2 },
} satisfies GameDefinition;
