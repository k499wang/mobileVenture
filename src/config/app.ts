import settings from './app.json';

/** Shared JSON also loads in Expo's build-time config without a TS require hook. */
export const appConfig = settings;
