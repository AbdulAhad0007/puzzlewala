import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { Card, ProgressBar, Screen, Tap, Txt } from '../components/ui';
import { dateKey, QUEST_GOAL, useActiveProfile } from '../context/useAppStore';
import { avatarEmoji } from '../data/avatars';
import { countStars, firstOpenPuzzle, getPuzzle, PICTURE_WORLDS, solvedCount, type SetId } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { withName, type StringKey } from '../i18n/strings';
import { colors, MIN_TOUCH, radii, shadow, spacing } from '../theme/colors';

export function HomeScreen() {
  const t = useT();
  const navigation = useNavigation();
  const profile = useActiveProfile();
  const { solved, curriculum } = profile;

  const journey: SetId[] = [
    ...(curriculum.phonics ? (['alphabet'] as const) : []),
    ...(curriculum.hindi ? (['hindi'] as const) : []),
    ...(curriculum.counting ? (['numbers'] as const) : []),
    ...PICTURE_WORLDS,
  ];
  // An unfinished puzzle comes first, so the child picks up exactly where they stopped.
  const next = profile.session
    ? getPuzzle(profile.session.current_level)
    : journey.map((id) => firstOpenPuzzle(id, solved)).find(Boolean);

  const today = profile.today.date === dateKey() ? profile.today : null;
  const questCount = Math.min(today?.solved ?? 0, QUEST_GOAL);
  const pictureSolved = PICTURE_WORLDS.reduce((sum, id) => sum + solvedCount(id, solved), 0);

  const paths = [
    curriculum.phonics && {
      key: 'alphabet', title: 'alphabetTitle' as StringKey, emoji: '🔤', total: 26, done: solvedCount('alphabet', solved),
      tint: colors.skyBlueSoft, fill: colors.skyBlueDark, go: () => navigation.navigate('AlphabetLevels'),
    },
    curriculum.counting && {
      key: 'numbers', title: 'numberTitle' as StringKey, emoji: '🔢', total: 100, done: solvedCount('numbers', solved),
      tint: colors.sunshineSoft, fill: colors.sunshineDark, go: () => navigation.navigate('Numbers'),
    },
    {
      key: 'pictures', title: 'pictureTitle' as StringKey, emoji: '🖼️', total: 40, done: pictureSolved,
      tint: colors.candyPinkSoft, fill: colors.candyPinkDark, go: () => navigation.navigate('PicturePuzzles'),
    },
  ].filter((p) => !!p);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppLogo />
      <View style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarEmoji}>{avatarEmoji(profile.avatarId)}</Text></View>
        <View style={{ flex: 1 }}>
          <Txt testID="hello" weight="black" size={20} numberOfLines={1} adjustsFontSizeToFit>{withName(t('hello'), profile.name)}</Txt>
          <Txt size={13} color={colors.textMuted} numberOfLines={1} adjustsFontSizeToFit>{withName(t('letsLearn'), profile.name)}</Txt>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.sunshineSoft }]} accessibilityLabel={`${countStars(solved)} stars`}>
          <Text>⭐</Text><Txt weight="black" size={16}>{countStars(solved)}</Txt>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.candyPinkSoft }]} accessibilityLabel={`${profile.streak} day streak`}>
          <Text>🔥</Text><Txt weight="black" size={16}>{profile.streak}</Txt>
        </View>
      </View>

      <Tap
        testID="resume"
        accessibilityLabel={t('resumeJourney')}
        onPress={() => {
          if (next) navigation.navigate('PuzzleGameplay', { puzzleId: next.id });
          else navigation.navigate('MainTabs', { screen: 'Puzzles' });
        }}
      >
        <LinearGradient colors={[colors.skyBlue, colors.lavender]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Txt weight="black" size={30}>{t('letsPlay')}</Txt>
            <Txt weight="bold" size={15}>{t('resumeJourney')}</Txt>
            {next ? <Txt weight="black" size={18}>{next.emoji} {next.title}</Txt> : null}
          </View>
          <View style={styles.playCircle}><Feather name="play" size={30} color={colors.textDark} /></View>
        </LinearGradient>
      </Tap>

      {paths.map((p) => (
        <Tap key={p.key} testID={`path-${p.key}`} accessibilityLabel={t(p.title)} onPress={p.go} style={[styles.path, { backgroundColor: p.tint }]}>
          <View style={styles.pathIcon}><Text style={{ fontSize: 34 }}>{p.emoji}</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="black" size={19} numberOfLines={1}>{t(p.title)}</Txt>
            <Txt size={14} color={colors.textMuted}>{p.done}/{p.total} {t('puzzles')}</Txt>
            <ProgressBar value={p.done / p.total} color={p.fill} track={colors.white} />
          </View>
          <Feather name="chevron-right" size={28} color={colors.textDark} />
        </Tap>
      ))}

      <Card style={styles.quest}>
        <Text style={{ fontSize: 34 }}>🎁</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="black" size={17}>{t('dailyQuest')}</Txt>
          <Txt size={14} color={colors.textMuted}>
            {today?.questClaimed ? t('questDone') : `${t('questText')} (${questCount}/${QUEST_GOAL}) · ${t('questReward')}`}
          </Txt>
          <ProgressBar value={questCount / QUEST_GOAL} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 60, height: 60, borderRadius: radii.full, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  avatarEmoji: { fontSize: 34, lineHeight: 44 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, borderRadius: radii.full, minHeight: 40 },
  hero: { borderRadius: radii.xl, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 130 },
  playCircle: { width: 64, height: 64, borderRadius: radii.full, backgroundColor: colors.sunshine, alignItems: 'center', justifyContent: 'center' },
  path: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, minHeight: MIN_TOUCH + 32 },
  pathIcon: { width: 60, height: 60, borderRadius: radii.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  quest: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
