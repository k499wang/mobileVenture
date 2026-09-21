# Consumer App Factory

This directory holds the `create-consumer-app` generator. The repository root is the one canonical app foundation; the generator copies it into a new, independent Expo project while excluding development artifacts, native build folders, Git metadata, and the generator itself.

## Local use

```sh
node factory/create-app.mjs ../my-new-app
```

The command prompts for a name, slug, bundle ID, and brand color. For automation, use `--yes` and pass `--name`, `--slug`, `--bundle-id`, and `--brand-color`.

Every generated app contains the full foundation source and can be changed independently. Improvements made here can be rolled into an existing app deliberately; they do not require a shared runtime dependency.
