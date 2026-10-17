# Consumer App Factory

An Expo SDK 57 foundation for iOS subscription apps, with a generator for new apps and a local multi-agent studio for prototyping them.

- **App foundation** (`src/`): onboarding, RevenueCat paywall, Apple/Google sign-in, analytics, attribution and an optional pet/game module.
- **Generator** ([`factory/`](factory/README.md)): copies the foundation into a new, independent app.
- **Venture Studio** ([`factory/agent/`](factory/agent/README.md)): goes from a market brief to an approved spec and a generated, verified app.

## Requirements

- macOS with Xcode 26.4+
- Node 22.13+ (`nvm use`)

## Getting started

Create a new app:

```sh
npm ci
npm run factory:create -- ../my-app
cd ../my-app
npm install
cp .env.example .env
npm run ios
```

Or run the foundation directly:

```sh
npm ci
cp .env.example .env
npm run ios
```

All integrations are optional in development. Missing keys disable that service.

## Configuration

| File | Purpose |
| --- | --- |
| `src/config/app-definition.ts` | App name, links, auth, paywall placement, reminders, tabs, onboarding |
| `src/config/game-definition.ts` | Pet/game module tuning (`enabled: false` to turn it off) |
| `src/theme/theme.ts` | Colors, fonts, spacing and other style tokens |
| `src/i18n/en.ts` | Copy |
| `.env` | Public keys for Supabase, RevenueCat, PostHog, AppsFlyer and Sentry |

Put app-specific code in `src/features/<feature>` and render it from `src/app/(tabs)/index.tsx`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run ios` | Build and run on the iOS simulator |
| `npm run check` | Typecheck, lint and test |
| `npm run validate:release` | Release readiness checks |
| `npm run factory:create -- <dir>` | Generate a new app |
| `npm run agent:studio` | Start Venture Studio at http://127.0.0.1:4317 |
| `npm run agent:test` | Run the agent tests |

## Project structure

```
src/          App source (routes, features, services, config, theme)
supabase/     Database migrations and edge functions
factory/      App generator and Venture Studio
scripts/      Release validation and build hooks
docs/         Launch checklist, measurement and testing notes
```

## Release

```sh
npm run check
npm run validate:release
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform ios --profile production
```

Complete the [launch checklist](docs/launch-checklist.md) on a real device before submitting.

## Documentation

- [AGENTS.md](AGENTS.md): conventions and full setup guide
- [docs/measurement.md](docs/measurement.md): analytics and revenue event ownership
- [docs/testing.md](docs/testing.md): test suites
- [factory/agent/README.md](factory/agent/README.md): Venture Studio architecture

## License

[MIT](LICENSE)
