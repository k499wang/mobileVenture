import { type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { t } from '@/i18n';
import { reportError } from '@/services/errors';

export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportError(error, 'ui.render'); }, [error]);
  return <Screen scroll={false} style={styles.container}>
    <Text variant="title">{t('common.error')}</Text>
    <Text color="muted">{t('common.tryAgain')}</Text>
    <Button title="Try again" onPress={() => void retry()} />
  </Screen>;
}
const styles = StyleSheet.create({ container: { justifyContent: 'center' } });
