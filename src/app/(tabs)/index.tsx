import { gameDefinition } from '@/config/game-definition';
import { HomeScreen } from '@/features/home/HomeScreen';
import { PetHomeScreen } from '@/features/pet/PetHomeScreen';

/** Compose the app-specific feature here. Pet apps get the pet room; others the plain feature screen. */
export default function Home() {
  return gameDefinition.enabled ? <PetHomeScreen /> : <HomeScreen />;
}
