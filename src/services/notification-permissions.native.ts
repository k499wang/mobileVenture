import * as Notifications from 'expo-notifications';

export async function requestNotificationPermission() {
  return (await Notifications.requestPermissionsAsync()).granted;
}
