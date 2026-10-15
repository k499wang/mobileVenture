# Per-app launch checklist

## App and environments

- [ ] Replace template name, slug, identifiers, scheme, icons, splash, home screen, and ATT explanation.
- [ ] Set privacy and terms URLs in `src/config/app-definition.ts`.
- [ ] Configure separate development/preview/production EAS environments and vendor projects/keys.
- [ ] Register the bundle ID and RevenueCat app. Set `appStoreId` and `links.supportEmail` in app-definition.
- [ ] Link this copy to its own EAS project. Configure signing and submission credentials.
- [ ] `npm ci`, `npm run check`, and `npm run validate:release` pass.
- [ ] Produce native release builds for iOS. Verify SDK 57 toolchain requirements.

## RevenueCat

- [ ] Connect App Store / Play credentials and server notifications.
- [ ] Configure products, entitlement, offering, paywall, and `default` placement (or the placements used by your screens).
- [ ] Configure Customer Center and the offering's legal links/localized prices.
- [ ] Decide and test RevenueCat restore/transfer behavior across anonymous and registered accounts.
- [ ] Enable AppsFlyer integration, sandbox key, event mappings, and revenue basis.
- [ ] Enable PostHog integration, sandbox project, and actual paywall events.
- [ ] Confirm customer attributes include `$appsflyerId` and `$posthogUserId` before the test purchase.

## Meta / AppsFlyer

- [ ] Connect the correct Meta app/business/ad account and activate AppsFlyer's Meta integration.
- [ ] Enable relevant partner postbacks and map exact case-sensitive event names.
- [ ] Configure SKAN measurement and Meta interoperability; confirm conversion-value ownership.
- [ ] Verify initial trial/purchase optimization signals, not only revenue appearing in a dashboard.
- [ ] Set up OneLink, associated domains if deep links are used; test installed and deferred flows.
- [ ] Confirm no duplicate subscription revenue path exists through another SDK or server integration.

## Device smoke tests

- [ ] Fresh install: ATT allowed and denied from the dedicated onboarding step; no permission dialog behind the splash.
- [ ] New anonymous customer: onboarding, actual paywall, purchase, access unlocked.
- [ ] Existing subscriber: no paywall, correct access after relaunch.
- [ ] Cancel purchase, pending/failed purchase, unavailable offering, and offline launch: useful state and retry.
- [ ] Restore on reinstall/another device; manage subscription; trial conversion, renewal, expiration, refund.
- [ ] Slow/offline initialization recovers on foreground and subsequent purchase actions.
- [ ] Optional accounts: anonymous-to-account login, logout, account A-to-B switch, and no old cached user data/access.
- [ ] Verify RevenueCat integration delivery and matching PostHog user, AppsFlyer event, and Meta receipt/eligibility.
- [ ] Repeat initial purchase with immediate app close to check SKAN timing.
- [ ] Trigger a release-build error and confirm Sentry receives a symbolicated stack with the correct environment.

## App-specific backend and release

- [ ] Enforce paid backend access server-side; configure Supabase RLS for actual tables.
- [ ] If accounts exist, implement and test authenticated deletion of the app's actual user data, then sign out.
- [ ] Complete store privacy disclosures and consent behavior for the app's audience and enabled SDKs.
- [ ] Check accessibility, small screens, tablets if enabled, localization, and support links.
- [ ] Record app version, template version, service configuration, and release test evidence.
- [ ] Establish a staged rollout and rollback/hotfix process before scaling ad spend.
