import { StyleSheet, Text, View } from 'react-native';
import { BigButton, Card, Header, ProgressBar, Screen, Txt } from '../components/ui';
import { useActiveProfile } from '../context/useAppStore';
import { PICTURE_WORLDS, SETS, solvedCount } from '../data/puzzles';
import { useT } from '../hooks/useT';
import type { StringKey } from '../i18n/strings';
import type { RootProps } from '../navigation/types';
import { colors, radii, spacing } from '../theme/colors';

export function PicturePuzzlesScreen({ navigation }: RootProps<'PicturePuzzles'>) {
  const t = useT();
  const { solved } = useActiveProfile();
  return (
    <Screen>
      <Header title={t('pictureTitle')} sub={t('pictureSub')} onBack={navigation.goBack} />
      {PICTURE_WORLDS.map((id) => {
        const set = SETS[id];
        const done = solvedCount(id, solved);
        return (
          <Card key={id} style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: set.soft }]}><Text style={styles.emoji}>{set.emoji}</Text></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="black" size={20} numberOfLines={1} adjustsFontSizeToFit>{t(`world.${id}` as StringKey)}</Txt>
                <Txt size={14} color={colors.textMuted}>{done}/{set.puzzles.length} {t('puzzles')}</Txt>
                <ProgressBar value={done / set.puzzles.length} />
              </View>
            </View>
            <BigButton label={t('enterWorld')} size={18} height={60} onPress={() => navigation.navigate('PuzzleSet', { setId: id })} />
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  icon: { width: 72, height: 72, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 40, lineHeight: 52 },
});
