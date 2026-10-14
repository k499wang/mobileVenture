# Testing

Two suites, both fast and offline:

| Suite | Runner | Command | Covers |
| --- | --- | --- | --- |
| App | Jest (`jest-expo`) | `npm test -- --runInBand` | Pure logic in `src/` (onboarding, auth gate, pet engine, stores, i18n, services) |
| Factory agent | `node --test` | `npm run agent:test` | Schema validation, run store, tools, orchestrator, research, creatives |

Run both with `npm run test:all`. CI runs `npm run check` plus the agent suite.

## Conventions

- Keep rules pure and pass time in (`now`) so tests are deterministic; the pet engine is the model.
- Put a test next to the module it covers (`engine.ts` → `engine.test.ts`).
- Agent tests that touch disk use a fresh `mkdtemp` directory and clean it up with `t.after`.
- Test behavior a user or operator would notice (e.g. "a missed day never loses the best streak"), not implementation details.
