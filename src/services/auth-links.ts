import * as Linking from 'expo-linking';

import { completeAuthFromUrl } from '@/services/auth';
import { reportError } from '@/services/errors';

function handleUrl(url: string | null) {
  if (!url) return;
  void completeAuthFromUrl(url).catch(error => reportError(error, 'auth.callback'));
}

/** Listen for both cold-start and foreground Supabase email/OAuth callbacks. */
export function initializeAuthLinkHandling() {
  void Linking.getInitialURL().then(handleUrl).catch(error => reportError(error, 'auth.initial-url'));
  const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
  return () => subscription.remove();
}
