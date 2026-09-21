// TypeScript's resolver uses this fallback; Metro picks the native/web variant.
export async function requestNotificationPermission() {
  return false;
}
