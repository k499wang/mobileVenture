import * as StoreReview from 'expo-store-review';
import { trackEvent } from '@/services/analytics';

/** Call after a genuine success moment; iOS decides whether a prompt is shown. */
export async function requestReviewAfterSuccess() {
  if (!await StoreReview.hasAction()) return false;
  trackEvent('review_prompt_requested', {});
  await StoreReview.requestReview();
  return true;
}
