# Expo SDK 57 contract for generated prototypes

The exact versioned SDK reference was consulted before adding the agent's generated
feature templates: https://docs.expo.dev/versions/v57.0.0/ . Use that versioned
reference for any subsequent native/API changes; do not substitute latest examples.

This agent builds against this repository's installed Expo SDK 57 foundation. It
may add TypeScript source under `src/features/venture/` and compose the feature
from `src/app/(tabs)/index.tsx`. It cannot add dependencies, native code, plugins,
permissions, or change billing/authentication integrations.

Read `src/components/ui.tsx`, `src/theme/theme.ts`, and
`src/services/user-data.ts` before implementing a screen. Use their exported
contracts and theme tokens. Keep TypeScript strict. Use `saveAppData` and
`hydrateAppDataFromCloud` for generic local-first JSON data. Emit the existing
`core_action_completed` event only after a meaningful successful action.

Type checking does not establish simulator, device, purchase, or market behavior.
The prototype must still receive manual review in the native development build.
