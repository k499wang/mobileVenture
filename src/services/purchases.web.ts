import { useAppStore } from '@/store/app-store';
export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'already-active';
export async function initializePurchases() { useAppStore.setState({ entitlementStatus: 'disabled' }); }
export const refreshPurchases = initializePurchases;
export async function syncPurchaseIdentifiers() {}
export async function setPurchaseUser(_userId: string | null) {}
export async function presentPaywall(_placement = 'default'): Promise<PaywallOutcome> { throw new Error('Purchases require the mobile app.'); }
export async function restorePurchases(): Promise<boolean> { throw new Error('Purchases require the mobile app.'); }
export async function manageSubscription() { throw new Error('Purchases require the mobile app.'); }
