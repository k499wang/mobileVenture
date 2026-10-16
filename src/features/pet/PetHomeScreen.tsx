import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Input, Screen, Text } from '@/components/ui';
import { gameDefinition } from '@/config/game-definition';
import { petContent } from '@/content/pet-content';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme';
import { levelProgress, petLine, stageFor, today } from './engine';
import { PetAvatar } from './PetAvatar';
import { usePetStore } from './store';
import type { GameEvent, GameState, Mood } from './types';
import { formatDuration, runGameAction, useGame } from './use-game';

const moods: { value: Mood; emoji: string }[] = [{ value: 1, emoji: '😢' }, { value: 2, emoji: '😕' }, { value: 3, emoji: '😐' }, { value: 4, emoji: '🙂' }, { value: 5, emoji: '😄' }];
const ctxFor = (now: number) => ({ def: gameDefinition, content: petContent, now, isPro: false });
const fill = (text: string, game: GameState) => text.replaceAll('{{pet}}', game.petName);

/** The pet's room: the Finch-style core loop on one screen. */
export function PetHomeScreen() {
  const theme = useTheme();
  const { game, now } = useGame();
  const store = usePetStore();
  const progress = levelProgress(game, gameDefinition);
  const stage = stageFor(progress.level, gameDefinition);
  const day = today(game, now);
  const room = petContent.items.find(item => item.id === game.equipped.room);
  const pose = game.adventure.status === 'returned' ? 'cheer' : day.mood !== undefined && day.mood <= 2 ? 'heart' : stage.pose;

  return <Screen>
    <View style={styles.row}>
      <View>
        <Text variant="title">{game.petName}</Text>
        <Text variant="caption" color="muted">{t('pet.level', { level: progress.level, stage: stage.name })} · {t('pet.streak', { days: game.streak.totalDays })}</Text>
      </View>
      <Chip label={`${gameDefinition.currency.icon} ${game.currency}`} />
    </View>

    <Card style={styles.center}>
      {room ? <Text style={styles.roomItem}>{room.emoji}</Text> : null}
      <View style={[styles.bubble, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md }]}><Text>{petLine(game, ctxFor(now))}</Text></View>
      {game.adventure.status === 'away'
        ? <Text style={styles.awayEmoji}>🧺</Text>
        : <PetAvatar pose={pose} equipped={game.equipped} size={190} />}
      <ProgressBar label={`XP ${progress.current}/${progress.needed}`} ratio={progress.ratio} />
      <ProgressBar label={`${t('pet.energy')} ${game.energy}/${gameDefinition.energy.max}`} ratio={game.energy / gameDefinition.energy.max} />
      <AdventureButton game={game} now={now} />
    </Card>

    <Card>
      <Text variant="heading">{t('pet.checkinTitle')}</Text>
      {day.mood === undefined
        ? <View style={styles.moods}>{moods.map(mood => <Pressable key={mood.value} accessibilityRole="button" accessibilityLabel={`Mood ${mood.value}`} onPress={() => runGameAction(() => store.checkIn(mood.value))} style={({ pressed }) => [styles.mood, pressed && styles.pressed]}><Text style={styles.moodEmoji}>{mood.emoji}</Text></Pressable>)}</View>
        : <Text color="muted">{t('pet.checkedIn', { mood: moods.find(mood => mood.value === day.mood)?.emoji ?? '' })}</Text>}
    </Card>

    <Goals game={game} done={day.goalsDone} />
    <Quests game={game} />
    <StoryModal />
    <CelebrationModal game={game} />
  </Screen>;
}

function ProgressBar({ label, ratio }: { label: string; ratio: number }) {
  const theme = useTheme();
  return <View style={styles.bar}>
    <Text variant="caption" color="muted">{label}</Text>
    <View style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}><View style={[styles.track, { width: `${Math.min(1, Math.max(0, ratio)) * 100}%`, backgroundColor: theme.brand }]} /></View>
  </View>;
}

function AdventureButton({ game, now }: { game: GameState; now: number }) {
  const store = usePetStore();
  if (game.adventure.status === 'away') return <Text color="muted" style={styles.centerText}>{t('pet.away', { pet: game.petName, time: formatDuration(game.adventure.endsAt - now) })}</Text>;
  if (game.adventure.status === 'returned') return <Button title={t('pet.collect')} onPress={() => runGameAction(store.collectAdventure)} style={styles.full} />;
  const ready = game.energy >= gameDefinition.energy.max;
  return ready
    ? <Button title={t('pet.startAdventure', { pet: game.petName })} onPress={() => runGameAction(store.startAdventure)} style={styles.full} />
    : <Text variant="caption" color="muted" style={styles.centerText}>{t('pet.needEnergy', { pet: game.petName })}</Text>;
}

function Goals({ game, done }: { game: GameState; done: string[] }) {
  const store = usePetStore();
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  function confirmRemove(goalId: string) {
    Alert.alert(t('pet.removeGoalTitle'), undefined, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('pet.remove'), style: 'destructive', onPress: () => store.removeGoal(goalId) }]);
  }
  return <Card>
    <Text variant="heading">{t('pet.goals')}</Text>
    {game.goals.length === 0 ? <Text color="muted">{t('pet.goalsEmpty')}</Text> : null}
    {game.goals.map(goal => {
      const complete = done.includes(goal.id);
      return <Pressable key={goal.id} accessibilityRole="checkbox" accessibilityState={{ checked: complete }} disabled={complete}
        onPress={() => runGameAction(() => store.completeGoal(goal.id))} onLongPress={() => confirmRemove(goal.id)}
        style={[styles.goal, { borderColor: complete ? theme.brand : theme.colors.line, borderRadius: theme.radius.md, backgroundColor: complete ? `${theme.brand}1F` : 'transparent' }]}>
        <Text>{complete ? '✅' : '⬜️'}</Text><Text style={styles.flex} color={complete ? 'muted' : 'text'}>{goal.title}</Text>
      </Pressable>;
    })}
    <Input value={draft} onChangeText={setDraft} placeholder={t('pet.addGoal')} returnKeyType="done" onSubmitEditing={() => { store.addGoal(draft); setDraft(''); }} />
  </Card>;
}

function Quests({ game }: { game: GameState }) {
  const store = usePetStore();
  const sections = [{ title: t('pet.daily'), list: game.quests.daily }, { title: t('pet.weekly'), list: game.quests.weekly }];
  return <Card>
    <Text variant="heading">{t('pet.quests')}</Text>
    {sections.map(section => <View key={section.title} style={styles.questGroup}>
      <Text variant="caption" color="muted">{section.title.toUpperCase()}</Text>
      {section.list.map(entry => {
        const quest = petContent.quests.find(item => item.id === entry.id);
        if (!quest) return null;
        const complete = entry.progress >= quest.target;
        return <View key={entry.id} style={styles.row}>
          <View style={styles.flex}><Text>{fill(quest.title, game)}</Text><Text variant="caption" color="muted">{entry.progress}/{quest.target} · {gameDefinition.currency.icon} {quest.reward}</Text></View>
          {entry.claimed ? <Text variant="caption" color="muted">{t('pet.claimed')}</Text>
            : complete ? <Button title={t('pet.claim')} onPress={() => runGameAction(() => store.claimQuest(entry.id))} style={styles.claim} /> : null}
        </View>;
      })}
    </View>)}
  </Card>;
}

function StoryModal() {
  const story = usePetStore(state => state.story);
  const dismiss = usePetStore(state => state.dismissStory);
  const collectible = petContent.collectibles.find(item => item.id === story?.collectibleId);
  return <Modal visible={Boolean(story)} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={styles.backdrop}><Card style={styles.modal}>
      <Text variant="caption" color="muted">{story?.place.toUpperCase()}</Text>
      <Text>{story?.story}</Text>
      <Text color="muted">{story?.encounter}</Text>
      <Text variant="label" color="brand">{t('pet.storyEarned', { amount: story?.currency ?? 0, currency: gameDefinition.currency.icon })}</Text>
      {collectible ? <Text variant="label">{collectible.emoji} {collectible.name}</Text> : null}
      <Button title={t('pet.nice')} onPress={dismiss} />
    </Card></View>
  </Modal>;
}

function celebrationText(event: GameEvent, game: GameState) {
  if (event.type === 'level-up') return event.stage ? t('pet.grewUp', { pet: game.petName, stage: event.stage }) : t('pet.levelUp', { level: event.level });
  if (event.type === 'quest-complete') return t('pet.questDone');
  if (event.type === 'streak' && event.welcomeBack) return t('pet.welcomeBack', { pet: game.petName });
  return '';
}

function CelebrationModal({ game }: { game: GameState }) {
  const event = usePetStore(state => state.pending[0]);
  const dismiss = usePetStore(state => state.dismissEvent);
  const story = usePetStore(state => state.story);
  return <Modal visible={Boolean(event) && !story} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={styles.backdrop}><Card style={[styles.modal, styles.center]}>
      <PetAvatar pose="cheer" equipped={game.equipped} size={140} />
      <Text variant="heading" style={styles.centerText}>{event ? celebrationText(event, game) : ''}</Text>
      <Button title={t('pet.ok')} onPress={dismiss} style={styles.full} />
    </Card></View>
  </Modal>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  full: { alignSelf: 'stretch' },
  roomItem: { position: 'absolute', top: 16, right: 16, fontSize: 36 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  awayEmoji: { fontSize: 96, lineHeight: 190 },
  bar: { alignSelf: 'stretch', gap: 4 },
  track: { height: 8, borderRadius: 99 },
  moods: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { padding: 6 },
  moodEmoji: { fontSize: 36, lineHeight: 44 },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1 },
  questGroup: { gap: 10 },
  claim: { minHeight: 36, paddingHorizontal: 14 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' },
  modal: { gap: 14 },
});
