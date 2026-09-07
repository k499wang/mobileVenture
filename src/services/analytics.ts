import PostHog from 'posthog-react-native';
import { env, serviceStatus } from '@/config/env';
import { reportError } from './errors';

export type EventMap = {
  onboarding_started: { version: number };
  onboarding_step_completed: { version: number; step: number };
  onboarding_completed: { version: number };
  activation_completed: { action: string };
  paywall_requested: { placement: string };
  paywall_result: { placement: string; result: string };
  restore_completed: { active: boolean };
};
let posthog: PostHog | undefined;
export function initializePostHog() {
  if (!serviceStatus.posthog || posthog) return;
  posthog = new PostHog(env.posthogApiKey!, {
    host: env.posthogHost, captureAppLifecycleEvents: true, enableSessionReplay: false,
  });
}
export async function getAnalyticsId() {
  initializePostHog();
  await posthog?.ready();
  return posthog?.getDistinctId();
}
export function identifyAnalytics(userId: string) {
  try { initializePostHog(); posthog?.identify(userId); }
  catch (error) { reportError(error, 'analytics.identify'); }
}
export function resetAnalytics() {
  try { posthog?.reset(); } catch (error) { reportError(error, 'analytics.reset'); }
}
export function trackEvent<K extends keyof EventMap>(event: K, properties: EventMap[K]) {
  try { posthog?.capture(event, properties); }
  catch (error) { reportError(error, 'analytics.capture'); }
}
