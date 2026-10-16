# Consumer App Factory

## Non-negotiable rules

- Before editing Expo code, read the exact [Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/). Do not rely on unversioned Expo examples.
- Keep the foundation generic. Put each app’s feature only in `src/features/<feature>` and compose it from `src/app/index.tsx`.
- TypeScript must stay strict; use `npm run typecheck` and `npm test -- --runInBand` after changes. Never commit `.env`, service-role keys, certificates, or vendor secrets.
- Avoid medical/diagnostic claims. Keep restore purchases and account deletion visible. Show ATT before starting AppsFlyer tracking.

## Create an app

The root repository is the canonical foundation. It generates an independent app, so the generated app can be modified freely:

```sh
npm run factory:create -- ../my-app
# CI/non-interactive
npm run factory:create -- ../my-app --yes --name "My App" --slug my-app --bundle-id com.company.myapp --brand-color '#6C5CE7'
```

Then `cd ../my-app`, run `npm install`, copy `.env.example` to `.env`, and run `npm run ios`. The generator excludes Git history, dependencies, generated native folders, `.env`, and itself. Foundation fixes are intentionally ported to existing apps through reviewed commits; there is no hidden shared runtime dependency.

## Configuration and onboarding

`src/config/app-definition.ts` is the per-app control panel: stable `id`, name, legal/support links, App Store ID, `auth.required`, RevenueCat placement, reminder copy/time, `tabs`, and the ordered onboarding list. All styling lives in `src/theme/theme.ts`; shared components read only its tokens via `useTheme()`. All copy is plain text or a key in `src/i18n/en.ts` resolved with `t()`. The app is iOS-only: do not add `.web`/`.android` variants. Bump `onboardingVersion` whenever a shipped flow needs to show again.

Each onboarding item is a typed entry from `app-definition-types.ts`. Supported kinds are `info` (optional remote image/GIF), `video`, `select` (set `multiple: true` for multi-select), `text`, `slider`, `date`, `permission`, `loading`, `testimonial`, `rating`, `chart`, and `paywall`; `src/config/onboarding-examples.ts` has one of each. `when` checks an earlier answer and copy accepts `{{answers.key}}`. The flow automatically owns progress, back navigation, transitions, persistence, and standard events. Add a new kind by extending the discriminated union and adding only its `case` in `StepBody` in `OnboardingFlow`; do not fork existing step logic. The paywall step is soft: failures and dismissal continue. After onboarding, `AuthGate` requires Apple/Google sign-in when `auth.required` is true.

Use the `tracking` permission kind for ATT. It is the only path that starts AppsFlyer. A skipped tracking step intentionally leaves attribution off. Notification permission/reminders are optional and controlled by `reminders`.

## Feature, storage, and UI rules

Build the app-specific outcome in `src/features/<feature>` and export it from `src/app/(tabs)/index.tsx`. Gate premium actions with `requirePro(feature)` and premium UI with `<ProGate>`; never persist your own `isPro`. Build UI from `src/components/ui.tsx` primitives. Call `trackEvent('core_action_completed', { action })` after a meaningful outcome, then optionally `requestReviewAfterSuccess()`.

Use `saveAppData`/`hydrateAppDataFromCloud` from `src/services/user-data.ts` for generic local-first JSON data. It writes AsyncStorage first and synchronizes only for signed-in users. App-specific database schema belongs in a new migration, not in shared UI state.

Use `src/components/glass.tsx`: it chooses native Liquid Glass when available, blur otherwise, and opaque accessible surfaces for Reduce Transparency. Toggle it globally with `theme.glass`; never make every surface glass or hard-code colors into components.

## Pet / game module (Finch-style)

Optional, switched by `enabled` in `src/config/game-definition.ts` (tuning: pet stages → mascot poses, currency, energy, action rewards, XP curve, adventure timing, quest counts, Pro perks). Content (adventures, encounters, items, collectibles, quests, dialogue) is a typed pack in `src/content/pet-content.ts`; write new packs by hand in the session, never via an API script. Rules live in the pure, deterministic `src/features/pet/engine.ts` (tested in `engine.test.ts`); `store.ts` adds persistence, cloud sync via `saveAppData`, notifications, and analytics. Never punish missed days: streaks restart with a welcome back and nothing is lost. Add an app-specific action by adding it to `actions` and calling `usePetStore.getState().logAction('id')`. Without a pet, set `enabled: false` and remove the `shop` tab entry and `src/app/(tabs)/shop.tsx`.

## Integrations and dashboard setup

All public runtime values belong in `.env`/EAS environment variables. Missing values disable that integration safely in development.

- **Supabase:** create a project; set URL and publishable key; enable the Apple and Google providers; add `<scheme>://auth/callback` redirects. Run `supabase db push`, deploy `delete-account` and `revenuecat-webhook`, then store their server secrets with `supabase secrets set`. The migration enables RLS; clients can only access their own rows. Never expose `SUPABASE_SERVICE_ROLE_KEY`.
- **RevenueCat:** create an app per store identifier, connect App Store Connect/Play, add weekly/annual products and a `pro` entitlement, then make an offering/paywall and the `default` placement. Enable Customer Center and verify restore. Set platform public SDK keys and the entitlement ID.
- **AppsFlyer:** create the app, set dev key and numeric iOS app ID, configure SKAdNetwork/OneLink/associated domains as needed. In RevenueCat’s AppsFlyer integration, use the AppsFlyer dev key and map subscription events there—RevenueCat is the revenue owner. The app only sends non-revenue funnel events.
- **RevenueCat webhook:** set the webhook URL to the deployed `revenuecat-webhook` function and a bearer secret matching `REVENUECAT_WEBHOOK_SECRET`; set `REVENUECAT_APP_ID_TO_SLUG` to map RevenueCat app IDs to `appDefinition.id`. It updates server-side subscription status.
- **PostHog:** create a project, set API key/host, and compare typed standard events: `app_opened`, onboarding views/answers/completion, paywall requested/result, `trial_started`, `purchase_completed`, and `core_action_completed`. Keep subscription revenue itself owned by RevenueCat's server integration.

## Builds, submission, and JS updates

Run `npx eas-cli init` once per generated app, then configure production EAS secrets/environments. Use `npx eas-cli build --profile production --platform ios` and `npx eas-cli submit --platform ios --profile production`; each app is its own EAS project, so only it builds/submits. After the first compatible store build, run `npx eas-cli update:configure`, then ship compatible JavaScript-only fixes with `npx eas-cli update --channel production --message "fix: ..."`. Native modules, permissions, store metadata, runtime-version changes, and config-plugin changes require a new store build/review.

Before release run `npm run check` and `npm run validate:release`, then complete `docs/launch-checklist.md` on real devices (purchase, restore, login/logout, delete account, allowed/denied ATT, notifications, deep links, and offline recovery).
