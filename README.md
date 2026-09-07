# App studio starter

An iOS-first Expo SDK 57 foundation with optional Android support. Anonymous usage is the default; Supabase accounts are optional. Each app should have its own repository and vendor configuration.

## Start an app

1. Use Node 22.13+ (`nvm use`), then `npm ci`.
2. Copy `.env.example` to `.env`. Fill only the services you need for development. All `EXPO_PUBLIC_*` values ship in the app.
3. Set app name, slug, scheme, and bundle/package IDs in `.env` or EAS environments. Edit `src/config/app.json` for entitlement, onboarding version, and support/legal URLs. Replace `assets` and the starter home screen.
4. Run `npm run ios` (Xcode 26.4+) or `npm run android`. Native SDKs require a development build; Expo Go is not the test target.
5. Configure a RevenueCat offering/paywall and placement named `default`, or call `presentPaywall('your-placement')` with your configured placement.
6. Follow [the launch checklist](docs/launch-checklist.md) before release or paid acquisition.

Development and preview builds receive separate display names, URL schemes, and bundle/package suffixes. Their store/RevenueCat configuration must match those identifiers. Use TestFlight with the production bundle for realistic App Store sandbox testing; preview identifiers do not automatically share production products.

## Structure

| Location | Responsibility |
| --- | --- |
| `src/config` | App choices and platform-aware public environment values |
| `src/services/purchases.ts` | Serialized purchase/account operations, entitlement refresh, RevenueCat identifiers |
| `src/services/analytics.ts` | Typed product events and PostHog identity |
| `src/services/attribution.ts` | ATT timing, AppsFlyer startup, non-revenue conversions, deep-link intake |
| `src/services/identity.ts` | Optional Supabase session changes and cache invalidation |
| `src/services/errors.ts` | Sentry setup and operational error reporting |
| `src/providers` | Query cache, connectivity, app foreground lifecycle, auth subscription |
| `src/store` | In-memory entitlement state, optional persisted onboarding, pending deep links |
| `src/app` | Routes and screen composition |

Put app-specific features under `src/features/<feature>`. Screens call service functions; they should not import billing or attribution SDKs. Keep server data in Query, local UI state in React/Zustand, and entitlements in RevenueCat. Do not persist a second authoritative `isPro` flag.

## Service behavior

- Missing keys disable optional services in development. Web billing is explicitly unavailable.
- Billing initialization and identity changes share a queue. Recoverable failures can retry on the next foreground or purchase action. Native calls are not blindly repeated while in flight.
- Entitlements distinguish unknown/loading/ready/error/disabled. A cached entitlement may survive a transient refresh error; consumers must consider both status and access. A user change clears access immediately.
- RevenueCat receives PostHog's distinct ID and the AppsFlyer UID before a paywall when those services are available. Identifier reads have deadlines; failed attribution does not prevent purchases. Retry occurs on foreground and subsequent paywalls. A first purchase during an attribution outage may not be attributed; monitor these errors.
- RevenueCat owns subscription revenue events. The app emits paywall **requests/results**, not invented impressions or purchase revenue. Enable RevenueCat paywall events in its PostHog integration for actual impressions.
- ATT is requested during startup after the native splash closes. AppsFlyer strict mode is off for consented IDFA collection. Apps for children or apps with another privacy model require an intentional per-app adjustment, including ATT and RevenueCat identifier collection.
- Deep links accept `deep_link_value=home` or `settings`. Add explicit destinations in `deep-link-store.ts` and `deep-link-handler.tsx`; do not route arbitrary payloads. OneLink/associated-domain setup is per app.
- Supabase is `null` when unconfigured. Its auth listener coordinates RevenueCat login/logout and analytics identity. Anonymous RevenueCat usage does not create a Supabase account. Initial Supabase state is consulted before billing initializes.
- Sentry requires a DSN to send errors. Configure its build plugin with `SENTRY_ORG`, `SENTRY_PROJECT`, and a build-secret `SENTRY_AUTH_TOKEN` for source maps. No replay or performance tracing is enabled by default.

## Extend it

For onboarding, use `useOnboardingStore`; wait for `hydrated`, then compare `completedVersion` with `appConfig.onboardingVersion`. Supply app-specific screens and completion actions. Onboarding is device-local by default.

For accounts, add your chosen login UI using the optional Supabase client. The provider owns downstream SDK synchronization. Add app-specific user caches to the identity cleanup callback. Queries should include user IDs in keys and honor cancellation signals. Do not enable paid backend operations based on client entitlement state: verify access on the server.

For experiments, keep assignment in one owner (RevenueCat for paywall/offering experiments or your chosen feature flag service). Add typed variant properties to product events. Avoid separate competing assignments for the same experiment.

For account deletion, implement an authenticated server endpoint for your actual data model, then sign out and clear local user data. Never ship a Supabase service-role key. A generic client-side deletion button cannot safely delete an unknown app's backend data.

## Checks and builds

```sh
npm run check
npm run validate:release
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile production --platform ios
```

`validate:release` deliberately fails on the unchanged template. EAS production builds run it after installation. Populate the production EAS environment first. CI runs typecheck, lint, and tests without vendor credentials.

Native folders are generated and ignored. After config-plugin/native dependency changes, regenerate deliberately; preserve any hand-written native work before using `expo prebuild --clean`. JavaScript export checks do not replace device builds or store sandbox purchase tests.

OTA updates are not configured. Add EAS Update only when needed, with runtime compatibility, environment/channel separation, source-map upload, and a tested rollback procedure.

## Maintain many apps

Record `appConfig.templateVersion` in every app. Keep a changelog of foundation fixes and apply relevant changes to app repositories. Extract a shared package only after multiple shipped apps establish a stable common API. Avoid a large plugin framework or a shared mutable backend just to reuse a few service modules.

See [event ownership](docs/measurement.md) and [launch checklist](docs/launch-checklist.md).
