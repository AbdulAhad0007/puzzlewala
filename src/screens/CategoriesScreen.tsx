import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { BigButton, Card, Header, ProgressBar, Screen, Tap, Txt } from '../components/ui';
import { useActiveProfile, useAppStore } from '../context/useAppStore';
import { SETS, solvedCount, type SetId } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { setKey } from '../i18n/strings';
import { SoundService } from '../services/SoundService';
import { colors, MIN_TOUCH, radii, spacing } from '../theme/colors';

const SPOKEN: Partial<Record<SetId, string>> = { hindi: 'अक्षरमाला' };

export function CategoriesScreen() {
  const t = useT();
  const navigation = useNavigation();
  const { solved, curriculum } = useActiveProfile();
  const language = useAppStore((s) => s.language);

  const cards: SetId[] = [
    ...(curriculum.phonics ? (['alphabet'] as const) : []),
    ...(curriculum.counting ? (['numbers'] as const) : []),
    'fruits', 'animals', 'shapes',
    ...(curriculum.phonics ? (['words'] as const) : []),
    ...(curriculum.hindi ? (['hindi'] as const) : []),
  ];

  const open = (id: SetId) => {
    if (id === 'alphabet') navigation.navigate('AlphabetLevels');
    else if (id === 'numbers') navigation.navigate('Numbers');
    else navigation.navigate('PuzzleSet', { setId: id });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppLogo />
      <Header title={t('toyBox')} sub={t('toyBoxSub')} />
      <View style={styles.grid}>
        {cards.map((id) => {
          const set = SETS[id];
          const done = solvedCount(id, solved);
          const name = t(setKey(id));
          const isHindi = id === 'hindi' || language === 'hi';
          return (
            <Card key={id} style={styles.card}>
              <View style={[styles.top, { backgroundColor: set.soft }]}>
                <Text style={styles.emoji}>{set.emoji}</Text>
                <Tap
                  accessibilityLabel={`Say ${name}`}
                  onPress={() => SoundService.pronounce(SPOKEN[id] ?? name, isHindi ? 'hi-IN' : 'en-IN')}
                  style={styles.speaker}
                  sound={false}
                >
                  <Feather name="volume-2" size={22} color={colors.textDark} />
                </Tap>
              </View>
              <Txt weight="black" size={18} numberOfLines={1} adjustsFontSizeToFit>{name}</Txt>
              <Txt size={14} color={colors.textMuted}>{done}/{set.puzzles.length} {t('solved')}</Txt>
              <ProgressBar value={done / set.puzzles.length} />
              <BigButton label={t('playNow')} height={MIN_TOUCH} size={16} onPress={() => open(id)} style={styles.play} />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  card: { width: '48.5%', padding: spacing.md, gap: 4 },
  top: { borderRadius: radii.md, height: 88, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 44, lineHeight: 58 },
  speaker: {
    position: 'absolute', right: -4, top: -4, width: 44, height: 44, borderRadius: radii.full,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  play: { marginTop: spacing.xs, paddingHorizontal: spacing.sm },
});
