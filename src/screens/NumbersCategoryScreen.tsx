import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LevelTile } from '../components/LevelTile';
import { Header, Screen, Segmented } from '../components/ui';
import { useActiveProfile } from '../context/useAppStore';
import { levelState, NUMBER_RANGES, numberPuzzles, solvedCount } from '../data/puzzles';
import { useT } from '../hooks/useT';
import type { RootProps } from '../navigation/types';
import { spacing } from '../theme/colors';

type RangeKey = (typeof NUMBER_RANGES)[number]['key'];

export function NumbersCategoryScreen({ navigation }: RootProps<'Numbers'>) {
  const t = useT();
  const { solved } = useActiveProfile();
  const [rangeKey, setRangeKey] = useState<RangeKey>('1-10');
  const range = NUMBER_RANGES.find((r) => r.key === rangeKey) ?? NUMBER_RANGES[0];
  const puzzles = numberPuzzles.slice(range.from - 1, range.to);

  return (
    <Screen>
      <Header title={t('numberTitle')} sub={`${solvedCount('numbers', solved)}/100 ${t('solved')}`} onBack={navigation.goBack} />
      <Segmented<RangeKey>
        options={NUMBER_RANGES.map((r) => ({ value: r.key, label: r.key }))}
        value={rangeKey}
        onChange={setRangeKey}
      />
      <View style={styles.grid}>
        {puzzles.map((p) => (
          <LevelTile
            key={p.id}
            puzzle={p}
            state={levelState(p, solved)}
            stars={solved[p.id] ?? 0}
            caption={p.title}
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
