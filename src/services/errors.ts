import * as Sentry from '@sentry/react-native';
import { env, serviceStatus } from '@/config/env';

export function initializeErrorReporting() {
  Sentry.init({
    dsn: env.sentryDsn,
    enabled: serviceStatus.sentry,
    environment: env.environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export function reportError(error: unknown, operation: string) {
  if (__DEV__) console.warn(operation, error);
  // Do not include SDK payloads, auth tokens, or customer attributes in context.
  if (serviceStatus.sentry) Sentry.captureException(error, { tags: { operation } });
}
