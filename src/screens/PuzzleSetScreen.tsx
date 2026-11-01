import { StyleSheet, View } from 'react-native';
import { LevelTile } from '../components/LevelTile';
import { Header, Screen } from '../components/ui';
import { useActiveProfile } from '../context/useAppStore';
import { levelState, SETS, solvedCount } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { setKey } from '../i18n/strings';
import type { RootProps } from '../navigation/types';
import { spacing } from '../theme/colors';

/** Levels of one themed set: Animals, Fruits, Shapes, Colors, Word Builder or Aksharmala. */
export function PuzzleSetScreen({ navigation, route }: RootProps<'PuzzleSet'>) {
  const t = useT();
  const { solved } = useActiveProfile();
  const set = SETS[route.params.setId];
  return (
    <Screen>
      <Header
        title={t(setKey(set.id))}
        sub={`${solvedCount(set.id, solved)}/${set.puzzles.length} ${t('solved')}`}
        onBack={navigation.goBack}
      />
      <View style={styles.grid}>
        {set.puzzles.map((p) => (
          <LevelTile
            key={p.id}
            puzzle={p}
            state={levelState(p, solved)}
            stars={solved[p.id] ?? 0}
            caption={p.short}
            style={styles.tile}
            onPlay={() => navigation.navigate('PuzzleGameplay', { puzzleId: p.id })}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  tile: { width: '48.5%' },
});
