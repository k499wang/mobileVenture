import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Screen, Text } from '@/components/ui';
import { gameDefinition } from '@/config/game-definition';
import { petContent } from '@/content/pet-content';
import { useEntitlement } from '@/hooks/use-entitlement';
import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme';
import { levelFor } from './engine';
import { PetAvatar } from './PetAvatar';
import { usePetStore } from './store';
import type { ItemSlot } from './types';
import { runGameAction, useGame } from './use-game';

type Tab = 'store' | 'closet' | 'collection';
const slots: ItemSlot[] = ['head', 'face', 'neck', 'room'];

export function ShopScreen() {
  const theme = useTheme();
  const { game } = useGame();
  const [tab, setTab] = useState<Tab>('store');
  return <Screen>
    <View style={styles.row}>
      <Text variant="display">{t('shop.title')}</Text>
      <Chip label={`${gameDefinition.currency.icon} ${game.currency}`} />
    </View>
    <View style={styles.center}><PetAvatar pose={game.adventure.status === 'away' ? 'sit' : 'happy'} equipped={game.equipped} size={150} /></View>
    <View style={[styles.tabs, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md }]}>
      {(['store', 'closet', 'collection'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}
        style={[styles.tab, { borderRadius: theme.radius.sm }, tab === value && { backgroundColor: theme.colors.surface }]}>
        <Text variant="label" color={tab === value ? 'text' : 'muted'}>{t(`shop.${value}`)}</Text>
      </Pressable>)}
    </View>
    {tab === 'store' ? <Store /> : tab === 'closet' ? <Closet /> : <Collection />}
  </Screen>;
}

function Store() {
  const { game } = useGame();
  const { isPro } = useEntitlement();
  const buy = usePetStore(state => state.buyItem);
  const level = levelFor(game.xp, gameDefinition);
  return <>{slots.map(slot => <Card key={slot}>
    <Text variant="heading">{t(`shop.slot.${slot}` as TranslationKey)}</Text>
    <View style={styles.grid}>{petContent.items.filter(item => item.slot === slot).map(item => {
      const owned = game.inventory.includes(item.id);
      const locked = (item.minLevel ?? 1) > level;
      const label = owned ? t('shop.owned') : locked ? t('shop.levelLock', { level: item.minLevel ?? 1 }) : `${item.premium && !isPro ? '⭐ ' : ''}${gameDefinition.currency.icon} ${item.price}`;
      return <ItemTile key={item.id} emoji={item.emoji} name={item.name} footer={label} dim={owned || locked} onPress={owned || locked ? undefined : () => runGameAction(() => buy(item.id))} />;
    })}</View>
  </Card>)}</>;
}

function Closet() {
  const { game } = useGame();
  const equip = usePetStore(state => state.equip);
  const owned = petContent.items.filter(item => game.inventory.includes(item.id));
  if (!owned.length) return <Card><Text color="muted">{t('shop.closetEmpty')}</Text></Card>;
  return <>{slots.map(slot => {
    const items = owned.filter(item => item.slot === slot);
    if (!items.length) return null;
    return <Card key={slot}>
      <Text variant="heading">{t(`shop.slot.${slot}` as TranslationKey)}</Text>
      <View style={styles.grid}>{items.map(item => {
        const wearing = game.equipped[slot] === item.id;
        return <ItemTile key={item.id} emoji={item.emoji} name={item.name} footer={wearing ? t('shop.equipped') : ''} selected={wearing} onPress={() => runGameAction(() => equip(slot, wearing ? null : item.id))} />;
      })}</View>
      {game.equipped[slot] ? <Button variant="ghost" title={t('shop.unequip')} onPress={() => equip(slot, null)} /> : null}
    </Card>;
  })}</>;
}

function Collection() {
  const { game } = useGame();
  return <Card>
    <Text color="muted">{t('shop.collected', { count: game.collection.length, total: petContent.collectibles.length })}</Text>
    <View style={styles.grid}>{petContent.collectibles.map(item => {
      const found = game.collection.includes(item.id);
      return <ItemTile key={item.id} emoji={found ? item.emoji : '❔'} name={found ? item.name : '???'} footer={found ? item.description : item.rarity} dim={!found} />;
    })}</View>
  </Card>;
}

function ItemTile({ emoji, name, footer, onPress, dim, selected }: { emoji: string; name: string; footer: string; onPress?: () => void; dim?: boolean; selected?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.tile, { borderRadius: theme.radius.md, borderColor: selected ? theme.brand : theme.colors.line, borderWidth: selected ? 2 : 1 }, (dim || pressed) && styles.dim]}>
    <Text style={styles.tileEmoji}>{emoji}</Text>
    <Text variant="caption" numberOfLines={1}>{name}</Text>
    {footer ? <Text variant="caption" color="muted" numberOfLines={2} style={styles.tileFooter}>{footer}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center' },
  tabs: { flexDirection: 'row', padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '30%', flexGrow: 1, maxWidth: '32%', alignItems: 'center', padding: 10, gap: 2 },
  tileEmoji: { fontSize: 34, lineHeight: 42 },
  tileFooter: { textAlign: 'center' },
  dim: { opacity: 0.55 },
});
