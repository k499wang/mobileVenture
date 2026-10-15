import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { appDefinition } from '@/config/app-definition';
import { t } from '@/i18n';
import { trackEvent } from '@/services/analytics';

const reminderKey = 'factory.daily-reminder.v2';
export type ReminderSettings = { enabled: boolean; hour: number; minute: number };
type Stored = { id: string | null; hour: number; minute: number };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function readStored(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(reminderKey);
    if (raw) return JSON.parse(raw) as Stored;
  } catch { /* fall through to defaults */ }
  return { id: null, hour: appDefinition.reminders.hour, minute: appDefinition.reminders.minute };
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const stored = await readStored();
  return { enabled: Boolean(stored.id), hour: stored.hour, minute: stored.minute };
}

/** Kept for existing callers. */
export async function isDailyReminderEnabled() { return (await getReminderSettings()).enabled; }

/**
 * Turns the daily reminder on/off and optionally moves it. Returns whether it is
 * now scheduled (false if notification permission was denied).
 */
export async function setDailyReminderEnabled(enabled: boolean, time?: { hour: number; minute: number }) {
  const stored = await readStored();
  const hour = time?.hour ?? stored.hour;
  const minute = time?.minute ?? stored.minute;
  if (stored.id) await Notifications.cancelScheduledNotificationAsync(stored.id).catch(() => undefined);
  if (!enabled) {
    await AsyncStorage.setItem(reminderKey, JSON.stringify({ id: null, hour, minute } satisfies Stored));
    trackEvent('reminder_updated', { enabled: false });
    return false;
  }
  if (!appDefinition.reminders.enabled) throw new Error('Daily reminders are disabled in this app configuration.');
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: t(appDefinition.reminders.title), body: t(appDefinition.reminders.body), sound: false },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await AsyncStorage.setItem(reminderKey, JSON.stringify({ id, hour, minute } satisfies Stored));
  trackEvent('reminder_updated', { enabled: true });
  return true;
}
