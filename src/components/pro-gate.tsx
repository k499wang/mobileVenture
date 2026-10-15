import type { PropsWithChildren, ReactNode } from 'react';

import { Button, Card, Text } from '@/components/ui';
import { useEntitlement } from '@/hooks/use-entitlement';
import { t } from '@/i18n';
import { requirePro } from '@/services/entitlements';

/** Renders children for Pro users; otherwise a locked card (or your `fallback`) that opens the paywall. */
export function ProGate({ feature, fallback, children }: PropsWithChildren<{ feature: string; fallback?: ReactNode }>) {
  const { isPro } = useEntitlement();
  if (isPro) return children;
  if (fallback !== undefined) return fallback;
  return <Card>
    <Text variant="heading">{t('pro.locked')}</Text>
    <Button title={t('pro.unlock')} onPress={() => void requirePro(feature)} />
  </Card>;
}
