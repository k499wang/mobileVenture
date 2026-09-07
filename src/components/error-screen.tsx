import { type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { reportError } from '@/services/errors';
import { ThemedText } from './themed-text';
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportError(error, 'ui.render'); }, [error]);
  return <View style={styles.container}>
    <ThemedText type="subtitle">Something went wrong</ThemedText>
    <ThemedText>Please try again.</ThemedText>
    <Button title="Try again" onPress={retry} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 } });
