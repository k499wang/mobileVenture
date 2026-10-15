import appConfig from './src/config/app.json';
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
  if (!['development', 'preview', 'production'].includes(environment)) throw new Error('Invalid EXPO_PUBLIC_APP_ENV');
  const suffix = environment === 'production' ? '' : `.${environment}`;
  const name = process.env.APP_NAME ?? config.name ?? 'Starter';
  const bundle = process.env.APP_BUNDLE_ID ?? config.ios?.bundleIdentifier ?? 'com.example.starter';
  const plugins = [...(config.plugins ?? [])];
  if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
    plugins.push(['@sentry/react-native/expo', {
      organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT,
    }]);
  }
  return {
    ...config,
    name: environment === 'production' ? name : `${name} (${environment})`,
    slug: process.env.APP_SLUG ?? config.slug ?? 'starter',
    scheme: `${process.env.APP_SCHEME ?? 'starter'}${environment === 'production' ? '' : `-${environment}`}`,
    ios: { ...config.ios, bundleIdentifier: `${bundle}${suffix}` },
    plugins,
    extra: { ...config.extra, studio: appConfig },
  };
};
