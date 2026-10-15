import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { appDefinition } from '@/config/app-definition';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme';

/** Tabs come from `appDefinition.tabs`; each `name` needs a file in this folder. */
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <NativeTabs tintColor={theme.brand} labelStyle={{ selected: { color: theme.brand } }}>
      {appDefinition.tabs.map(tab => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{t(tab.title)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.icon} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
