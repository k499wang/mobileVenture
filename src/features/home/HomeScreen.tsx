import { Alert, View } from 'react-native';

import { ProGate } from '@/components/pro-gate';
import { Button, Card, Chip, Screen, Text } from '@/components/ui';
import { appDefinition } from '@/config/app-definition';
import { useEntitlement } from '@/hooks/use-entitlement';
import { t } from '@/i18n';
import { trackEvent } from '@/services/analytics';
import { requirePro } from '@/services/entitlements';
import { requestReviewAfterSuccess } from '@/services/review';
import { useTheme } from '@/theme/theme';

/** Placeholder. Replace with the app's core feature; keep primitives from components/ui. */
export function HomeScreen() {
  const theme = useTheme();
  const { isPro } = useEntitlement();

  function completeExampleAction() {
    trackEvent('core_action_completed', { action: 'example_completed' });
    void requestReviewAfterSuccess();
    Alert.alert(t('home.done'));
  }

  async function runProAction() {
    if (!(await requirePro('example_pro_action'))) return;
    trackEvent('core_action_completed', { action: 'example_pro_action' });
    Alert.alert(t('home.done'));
  }

  return <Screen>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="heading">{appDefinition.name}</Text>
      <Chip label={isPro ? 'PRO' : 'FREE'} selected={isPro} />
    </View>
    <View style={{ gap: theme.spacing.md - 4, paddingVertical: theme.spacing.lg }}>
      <Text variant="caption" color="muted">{t('home.eyebrow')}</Text>
      <Text variant="display">{t('home.title')}</Text>
      <Text color="muted">{t('home.body')}</Text>
    </View>
    <Card>
      <Text variant="heading">{t('home.featureTitle')}</Text>
      <Text color="muted">{t('home.featureBody')}</Text>
      <Button title={t('home.featureCta')} onPress={completeExampleAction} />
    </Card>
    <Card>
      <Text variant="heading">{t('home.proTitle')}</Text>
      <Text color="muted">{t('home.proBody')}</Text>
      <Button title={t('home.proCta')} onPress={() => void runProAction()} />
    </Card>
    {/* Declarative alternative: content only Pro users see. */}
    <ProGate feature="example_pro_card">
      <Card><Text>✓ Pro content visible</Text></Card>
    </ProGate>
  </Screen>;
}
