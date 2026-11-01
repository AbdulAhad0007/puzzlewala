import { memo, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import type { Puzzle } from '../data/puzzles';
import { colors } from '../theme/colors';
import { isWithinSnap, MARGIN_RATIO, piecePath, SNAP_THRESHOLD, type Grid, type PieceInfo, type Point } from '../utils/jigsaw';
import { PuzzleArt } from './PuzzleArt';

const SPRING = { damping: 16, stiffness: 180, mass: 0.7 };

interface Props {
  puzzle: Puzzle;
  piece: PieceInfo;
  grid: Grid;
  cell: number;
  home: Point;
  target: Point;
  /** Size of a piece while resting in the tray. */
  trayScale: number;
  placed: boolean;
  onLift: () => void;
  onPlaced: (id: number) => void;
  onMissed: () => void;
}

export const DraggablePiece = memo(function DraggablePiece({
  puzzle, piece, grid, cell, home, target, trayScale, placed, onLift, onPlaced, onMissed,
}: Props) {
  const margin = cell * MARGIN_RATIO;
  const outer = cell + margin * 2;
  const clipId = `clip-${piece.id}`;
  const path = useMemo(() => piecePath(piece.col, piece.row, grid, cell), [piece, grid, cell]);

  const x = useSharedValue(placed ? target.x : home.x);
  const y = useSharedValue(placed ? target.y : home.y);
  const scale = useSharedValue(placed ? 1 : trayScale);
  const lifted = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Keep resting positions correct if the screen size changes.
  useEffect(() => {
    x.value = placed ? target.x : home.x;
    y.value = placed ? target.y : home.y;
    scale.value = placed ? 1 : trayScale;
    // Only a layout change should move a piece here; drops animate themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.x, home.y, target.x, target.y, trayScale]);

  const pan = usePanGesture({
    enabled: !placed,
    minDistance: 0,
    onActivate: () => {
      'worklet';
      startX.value = x.value;
      startY.value = y.value;
      lifted.value = 1;
      scale.value = withSpring(1, SPRING);
      runOnJS(onLift)();
    },
    onUpdate: (e) => {
      'worklet';
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    },
    onDeactivate: () => {
      'worklet';
      lifted.value = 0;
      if (isWithinSnap(x.value - target.x, y.value - target.y, SNAP_THRESHOLD)) {
        x.value = withSpring(target.x, SPRING);
        y.value = withSpring(target.y, SPRING);
        scale.value = withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, SPRING));
        runOnJS(onPlaced)(piece.id);
      } else {
        x.value = withSpring(home.x, SPRING);
        y.value = withSpring(home.y, SPRING);
        scale.value = withSpring(trayScale, SPRING);
        runOnJS(onMissed)();
      }
    },
  });

  const animated = useAnimatedStyle(() => ({
    zIndex: lifted.value ? 100 : placed ? 1 : 10,
    transform: [
      { translateX: x.value - outer / 2 },
      { translateY: y.value - outer / 2 },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={`piece-${piece.id}`}
        accessibilityLabel={`Puzzle piece ${piece.id + 1}`}
        style={[styles.piece, { width: outer, height: outer }, animated]}
        pointerEvents={placed ? 'none' : 'auto'}
      >
        <Svg
          width={outer}
          height={outer}
          viewBox={`${piece.col * cell - margin} ${piece.row * cell - margin} ${outer} ${outer}`}
        >
          <Defs>
            <ClipPath id={clipId}><Path d={path} /></ClipPath>
          </Defs>
          {placed ? null : <Path d={path} fill="#1E293B" opacity={0.2} transform={`translate(${cell * 0.012} ${cell * 0.035})`} />}
          <G clipPath={`url(#${clipId})`}>
            <PuzzleArt puzzle={puzzle} w={grid.cols * cell} h={grid.rows * cell} gradientId={`art-${piece.id}`} />
          </G>
          <Path d={path} fill="none" stroke={colors.white} strokeWidth={2.5} />
        </Svg>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
