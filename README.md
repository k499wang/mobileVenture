# App studio starter

An iOS-only Expo SDK 57 starter for subscription apps. Flow: **onboarding → soft RevenueCat paywall → required Apple/Google sign-in → Home/Settings tabs**. Each app should have its own repository and vendor configuration.

## Quick recipes

| I want to… | Edit |
| --- | --- |
| Restyle the app (colors, fonts, radii, spacing, glass on/off, light/dark) | `src/theme/theme.ts` only |
| Add/remove/reorder onboarding screens | `onboarding` array in `src/config/app-definition.ts` (copy entries from `src/config/onboarding-examples.ts`) |
| Change any copy or add a language | `src/i18n/en.ts` (add `es.ts` etc. and register it in `src/i18n/index.ts`) |
| Gate a premium action | `if (!(await requirePro('feature-name'))) return;` from `@/services/entitlements` |
| Hide premium UI | `<ProGate feature="x">…</ProGate>` from `@/components/pro-gate` |
| Read Pro status | `const { isPro, loading } = useEntitlement()` |
| Add a tab | add an entry to `tabs` in app-definition (SF Symbol icons) + a file in `src/app/(tabs)/` |
| Build the core feature | `src/features/<feature>/`, exported from `src/app/(tabs)/index.tsx` |
| Make sign-in optional | `auth: { required: false }` in app-definition |
| Build UI | primitives in `src/components/ui.tsx`: `Screen`, `Text`, `Button`, `Card`, `Section`, `ListRow`, `OptionCard`, `Input`, `Chip` |

Onboarding step kinds: `info`, `video`, `select` (single/multi), `text`, `slider`, `date`, `testimonial`, `rating`, `permission` (`tracking` or `notifications`), `loading`, `chart`, `paywall`. Bump `onboardingVersion` to show a changed flow to existing users.

## Start an app

1. Use Node 22.13+ (`nvm use`), then `npm ci`.
2. Copy `.env.example` to `.env`. Fill only the services you need for development. All `EXPO_PUBLIC_*` values ship in the app.
3. Set app name, slug, scheme, and bundle/package IDs in `.env` or EAS environments. Edit `src/config/app-definition.ts` for onboarding, tabs, entitlement placement, reminders, App Store ID, and legal/support links, and `src/theme/theme.ts` for styling. Replace the home feature placeholder.
4. Run `npm run ios` (Xcode 26.4+). Native SDKs require a development build; Expo Go is not the test target.
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
| `src/app` | Routes: root gates + `(tabs)` group |
| `src/theme/theme.ts` | Every style token |
| `src/i18n` | Copy and languages |
| `src/features/onboarding`, `auth`, `settings`, `home` | Flows and screens |

Put app-specific features under `src/features/<feature>`. Screens call service functions; they should not import billing or attribution SDKs. Keep server data in Query, local UI state in React/Zustand, and entitlements in RevenueCat. Do not persist a second authoritative `isPro` flag.

## Service behavior

- Missing keys disable optional services in development. Without Supabase keys, the sign-in screen offers a dev-only bypass; `validate:release` requires the keys.
- Billing initialization and identity changes share a queue. Recoverable failures can retry on the next foreground or purchase action. Native calls are not blindly repeated while in flight.
- Entitlements distinguish unknown/loading/ready/error/disabled. A cached entitlement may survive a transient refresh error; consumers must consider both status and access. A user change clears access immediately.
- RevenueCat receives PostHog's distinct ID and the AppsFlyer UID before a paywall when those services are available. Identifier reads have deadlines; failed attribution does not prevent purchases. Retry occurs on foreground and subsequent paywalls. A first purchase during an attribution outage may not be attributed; monitor these errors.
- RevenueCat owns subscription revenue events. The app emits paywall **requests/results**, not invented impressions or purchase revenue. Enable RevenueCat paywall events in its PostHog integration for actual impressions.
- ATT is requested only by the explicit onboarding tracking step. AppsFlyer does not start before that action. Apps for children or apps with another privacy model require an intentional per-app adjustment, including ATT and RevenueCat identifier collection.
- Deep links accept `deep_link_value=home` or `settings`. Add explicit destinations in `deep-link-store.ts` and `deep-link-handler.tsx`; do not route arbitrary payloads. OneLink/associated-domain setup is per app.
- Supabase is `null` when unconfigured. Its auth listener coordinates RevenueCat login/logout and analytics identity. Anonymous RevenueCat usage does not create a Supabase account. Initial Supabase state is consulted before billing initializes.
- Sentry requires a DSN to send errors. Configure its build plugin with `SENTRY_ORG`, `SENTRY_PROJECT`, and a build-secret `SENTRY_AUTH_TOKEN` for source maps. No replay or performance tracing is enabled by default.

## Extend it

For onboarding, edit `appDefinition.onboarding`. The shared gate, progress, conditions, copy interpolation, and standard analytics are already wired. Answers persist locally and sync to Supabase after sign-in when configured.

Accounts use Sign in with Apple and Google (via Supabase OAuth) after the paywall. A purchase made while anonymous moves to the account when RevenueCat `logIn` runs. The provider owns downstream SDK synchronization. Add app-specific user caches to the identity cleanup callback. Queries should include user IDs in keys and honor cancellation signals. Do not enable paid backend operations based on client entitlement state: verify access on the server.

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

Record `appConfig.templateVersion` in every app. Keep a changelog of foundation fixes and apply relevant changes to app repositories. Extract a shared package only after multiple shipped apps establish a stable common API. Avoid a large plugin framework or a shared mutable backend just to reuse a few service modules. See `AGENTS.md` for the full factory workflow.

See [event ownership](docs/measurement.md) and [launch checklist](docs/launch-checklist.md).

## Multi-agent research and prototyping

Run `npm run agent:studio` and open **http://127.0.0.1:4317** to use the local
Venture Studio console. Eight roles coordinate market research, critical review,
product specification, app generation, verification and experiment planning.
The demo needs no API key and labels its research fixtures; generated source,
checks, approval gates, persistence and failure recovery execute for real.

Run `npm run agent:demo` for the unattended repair demonstration, or
`npm run agent:test` for the agent tests. See the [setup and architecture](factory/agent/README.md)
and [interview walkthrough](factory/agent/WALKTHROUGH.md) for live mode and recording instructions.
