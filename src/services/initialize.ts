import { initializePostHog, trackEvent } from './analytics';
import { reportError } from './errors';
import { initializePurchases, syncPurchaseIdentifiers } from './purchases';

let inFlight: Promise<void> | undefined;
let openedTracked = false;
/** Coalesce simultaneous calls, but allow foreground retries after failure. */
export function initializeAppServices() {
  inFlight ??= initialize().finally(() => { inFlight = undefined; });
  return inFlight;
}
async function initialize() {
  try {
    initializePostHog();
    if (!openedTracked) { trackEvent('app_opened', {}); openedTracked = true; }
  } catch (error) { reportError(error, 'analytics.init'); }
  const billing = await initializePurchases().then(() => true, (error) => {
    reportError(error, 'billing.init');
    return false;
  });
  if (billing) {
    try { await syncPurchaseIdentifiers(); } catch (error) { reportError(error, 'identifiers.sync'); }
  }
}
