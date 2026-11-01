import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import type { Puzzle } from '../data/puzzles';
import { SoundService } from '../services/SoundService';
import { colors, radii } from '../theme/colors';
import {
  computeLayout, MARGIN_RATIO, makePieces, piecePath, shuffledOrder, slotCenter, trayCenter, type Grid,
} from '../utils/jigsaw';
import { DraggablePiece } from './DraggablePiece';
import { PuzzleArt } from './PuzzleArt';

const HINT_H = 72;
const COMPLETE_DELAY_MS = 650;

interface Props {
  puzzle: Puzzle;
  grid: Grid;
  /** Pieces already in place when the puzzle opens. */
  prefilled: number[];
  /** Show the picture clearly on the empty board, as a clue. */
  showClue: boolean;
  /** The mascot, rendered in the band between board and tray. */
  hint: ReactNode;
  /** Mistakes already made, when resuming a saved puzzle. */
  initialMisses?: number;
  onProgress: (placed: number[], total: number, misses: number) => void;
  onMiss: () => void;
  onComplete: (misses: number) => void;
}

export function JigsawBoard({ puzzle, grid, prefilled, initialMisses = 0, showClue, hint, onProgress, onMiss, onComplete }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [placed, setPlaced] = useState<ReadonlySet<number>>(() => new Set(prefilled));
  const misses = useRef(initialMisses);
  const placedRef = useRef(new Set(prefilled));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const pieces = useMemo(() => makePieces(grid), [grid]);
  const loose = useMemo(
    () => shuffledOrder(pieces.filter((p) => !prefilled.includes(p.id)).map((p) => p.id), puzzle.id),
    [pieces, prefilled, puzzle.id],
  );

  useEffect(
    () => onProgress([...placedRef.current], pieces.length, misses.current),
    [onProgress, pieces.length],
  );

  const handleLift = useCallback(() => SoundService.haptic(), []);

  const handlePlaced = useCallback((id: number) => {
    if (placedRef.current.has(id)) return;
    placedRef.current.add(id);
    setPlaced(new Set(placedRef.current));
    SoundService.play('snap');
    SoundService.haptic('success');
    onProgress([...placedRef.current], pieces.length, misses.current);
    if (placedRef.current.size === pieces.length) {
      SoundService.play('chime');
      timer.current = setTimeout(() => onComplete(misses.current), COMPLETE_DELAY_MS);
    }
  }, [onComplete, onProgress, pieces.length]);

  const handleMissed = useCallback(() => {
    misses.current += 1;
    SoundService.play('oops');
    onMiss();
  }, [onMiss]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((old) => (old && old.w === w && old.h === h ? old : { w, h }));
  };

  const layout = useMemo(
    () => (size ? computeLayout(size.w, size.h, grid, loose.length, HINT_H) : null),
    [size, grid, loose.length],
  );

  const trayScale = layout
    ? Math.min(1, (layout.traySlot * 0.98) / (layout.cell * (1 + MARGIN_RATIO * 2)))
    : 1;

  return (
    <View style={styles.surface} onLayout={onLayout}>
      {layout && size ? (
        <>
          <View
            style={[styles.board, {
              left: layout.boardX, top: layout.boardY, width: layout.boardW, height: layout.boardH,
            }]}
          >
            <Svg width={layout.boardW} height={layout.boardH}>
              <G opacity={showClue ? 0.6 : 0.14}>
                <PuzzleArt puzzle={puzzle} w={layout.boardW} h={layout.boardH} gradientId="ghost" />
              </G>
              {pieces.map((p) => (
                <Path
                  key={p.id}
                  d={piecePath(p.col, p.row, grid, layout.cell)}
                  fill="none"
                  stroke={colors.skyBlueDark}
                  strokeWidth={2}
                  strokeDasharray="7 6"
                  opacity={0.7}
                />
              ))}
            </Svg>
          </View>

          <View style={[styles.hint, { top: layout.hintY, height: HINT_H }]}>{hint}</View>

          {pieces.map((p) => {
            const trayIndex = loose.indexOf(p.id);
            const target = slotCenter(p, layout);
            return (
              <DraggablePiece
                key={p.id}
                puzzle={puzzle}
                piece={p}
                grid={grid}
                cell={layout.cell}
                target={target}
                home={trayIndex >= 0 ? trayCenter(trayIndex, loose.length, size.w, layout) : target}
                trayScale={trayScale}
                placed={placed.has(p.id)}
                onLift={handleLift}
                onPlaced={handlePlaced}
                onMissed={handleMissed}
              />
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1 },
  board: {
    position: 'absolute', backgroundColor: colors.white, borderRadius: radii.md, overflow: 'hidden',
  },
  hint: { position: 'absolute', left: 16, right: 16, justifyContent: 'center' },
});
