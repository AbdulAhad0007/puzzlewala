import { StyleSheet, View } from 'react-native';
import { LevelTile } from '../components/LevelTile';
import { Header, Screen } from '../components/ui';
import { useActiveProfile } from '../context/useAppStore';
import { alphabetPuzzles, levelState, solvedCount } from '../data/puzzles';
import { useT } from '../hooks/useT';
import type { RootProps } from '../navigation/types';
import { spacing } from '../theme/colors';

export function AlphabetLevelsScreen({ navigation }: RootProps<'AlphabetLevels'>) {
  const t = useT();
  const { solved } = useActiveProfile();
  return (
    <Screen>
      <Header title={t('alphabetTitle')} sub={`${solvedCount('alphabet', solved)}/26 ${t('solved')}`} onBack={navigation.goBack} />
      <View style={styles.grid}>
        {alphabetPuzzles.map((p) => (
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
  tile: { width: '31.5%' },
});
