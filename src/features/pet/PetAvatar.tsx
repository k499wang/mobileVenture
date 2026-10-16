import { StyleSheet, Text, View } from 'react-native';

import { Mascot, type MascotPose } from '@/components/mascot';
import { petContent } from '@/content/pet-content';
import type { ItemSlot } from './types';

/**
 * Where each wearable sits, as a fraction of the avatar size. Tune these if
 * you swap the mascot art. Swap emoji for PNGs later by rendering <Image> here.
 */
const anchors: Record<Exclude<ItemSlot, 'room'>, { top: number; left: number; scale: number }> = {
  head: { top: 0.0, left: 0.5, scale: 0.26 },
  face: { top: 0.4, left: 0.5, scale: 0.22 },
  neck: { top: 0.6, left: 0.5, scale: 0.2 },
};

export function PetAvatar({ pose, equipped, size = 200 }: { pose: MascotPose; equipped: Partial<Record<ItemSlot, string>>; size?: number }) {
  return <View style={{ width: size, height: size }}>
    <Mascot pose={pose} size={size} />
    {(Object.keys(anchors) as (keyof typeof anchors)[]).map(slot => {
      const item = petContent.items.find(entry => entry.id === equipped[slot]);
      if (!item) return null;
      const anchor = anchors[slot]; const fontSize = size * anchor.scale;
      return <Text key={slot} accessibilityLabel={item.name} style={[styles.item, { fontSize, lineHeight: fontSize * 1.2, top: size * anchor.top, left: size * anchor.left - fontSize / 2 }]}>{item.emoji}</Text>;
    })}
  </View>;
}

const styles = StyleSheet.create({ item: { position: 'absolute', textAlign: 'center' } });
