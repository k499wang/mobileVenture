import { initializePostHog } from './analytics';
import { initializeAttribution } from './attribution';
import { reportError } from './errors';
import { initializePurchases, syncPurchaseIdentifiers } from './purchases';

let inFlight: Promise<void> | undefined;
/** Coalesce simultaneous calls, but allow foreground retries after failure. */
export function initializeAppServices() {
  inFlight ??= initialize().finally(() => { inFlight = undefined; });
  return inFlight;
}
async function initialize() {
  try { initializePostHog(); } catch (error) { reportError(error, 'analytics.init'); }
  const results = await Promise.allSettled([initializePurchases(), initializeAttribution()]);
  results.forEach((result, index) => {
    if (result.status === 'rejected') reportError(result.reason, index ? 'attribution.init' : 'billing.init');
  });
  if (results[0].status === 'fulfilled') {
    try { await syncPurchaseIdentifiers(); } catch (error) { reportError(error, 'identifiers.sync'); }
  }
}
