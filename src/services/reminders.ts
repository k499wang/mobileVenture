import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { appDefinition } from '@/config/app-definition';
import { trackEvent } from '@/services/analytics';

const reminderKey = 'factory.daily-reminder.id';

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function isDailyReminderEnabled() {
  return Boolean(await AsyncStorage.getItem(reminderKey));
}

export async function setDailyReminderEnabled(enabled: boolean) {
  const existing = await AsyncStorage.getItem(reminderKey);
  if (existing) await Notifications.cancelScheduledNotificationAsync(existing).catch(() => undefined);
  if (!enabled) {
    await AsyncStorage.removeItem(reminderKey);
    trackEvent('reminder_updated', { enabled: false });
    return false;
  }
  if (!appDefinition.reminders.enabled) throw new Error('Daily reminders are disabled in this app configuration.');
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('daily-reminders', { name: 'Daily reminders', importance: Notifications.AndroidImportance.DEFAULT });
  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title: appDefinition.reminders.title, body: appDefinition.reminders.body, sound: false },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: appDefinition.reminders.hour, minute: appDefinition.reminders.minute, ...(Platform.OS === 'android' ? { channelId: 'daily-reminders' } : {}) },
  });
  await AsyncStorage.setItem(reminderKey, identifier);
  trackEvent('reminder_updated', { enabled: true });
  return true;
}
