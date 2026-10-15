import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

/** Transparent mascot poses in assets/images/mascot/. Add a pose: drop in a PNG and add a line here. */
export const mascotPoses = {
  happy: require('@/assets/images/mascot/happy.png'),
  smile: require('@/assets/images/mascot/smile.png'),
  'wink-wave': require('@/assets/images/mascot/wink-wave.png'),
  heart: require('@/assets/images/mascot/heart.png'),
  wave: require('@/assets/images/mascot/wave.png'),
  laugh: require('@/assets/images/mascot/laugh.png'),
  thinking: require('@/assets/images/mascot/thinking.png'),
  surprised: require('@/assets/images/mascot/surprised.png'),
  tablet: require('@/assets/images/mascot/tablet.png'),
  love: require('@/assets/images/mascot/love.png'),
  sleepy: require('@/assets/images/mascot/sleepy.png'),
  sad: require('@/assets/images/mascot/sad.png'),
  walk: require('@/assets/images/mascot/walk.png'),
  peek: require('@/assets/images/mascot/peek.png'),
  sit: require('@/assets/images/mascot/sit.png'),
  lying: require('@/assets/images/mascot/lying.png'),
  cheer: require('@/assets/images/mascot/cheer.png'),
  'side-sit': require('@/assets/images/mascot/side-sit.png'),
} as const;

export type MascotPose = keyof typeof mascotPoses;

export function Mascot({ pose, size = 180, style }: { pose: MascotPose; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={mascotPoses[pose]} style={[{ width: size, height: size }, style]} contentFit="contain" accessibilityIgnoresInvertColors />;
}
