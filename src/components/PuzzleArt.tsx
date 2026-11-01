import { Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { memo } from 'react';
import type { Puzzle } from '../data/puzzles';
import { colors, fonts } from '../theme/colors';

/** Lays out n emoji in tidy rows that fill the free area. */
function emojiGrid(count: number, w: number, top: number, h: number) {
  const perRow = count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : 5;
  const rows = Math.ceil(count / perRow);
  const size = Math.min(w / (perRow + 0.35), h / (rows + 0.2));
  const items: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i - row * perRow;
    items.push({
      x: w / 2 + (col - (inRow - 1) / 2) * (w / (perRow + 0.2)),
      y: top + h / 2 + (row - (rows - 1) / 2) * (h / (rows + 0.1)),
    });
  }
  return { size, items };
}

/**
 * Artwork in board coordinates. Each piece draws this same artwork through its own clip path,
 * so finished pieces line up into one seamless picture.
 */
export const PuzzleArt = memo(function PuzzleArt({ puzzle, w, h, gradientId }: {
  puzzle: Puzzle; w: number; h: number; gradientId: string;
}) {
  const glyph = puzzle.glyph;
  const wide = (glyph?.length ?? 0) > 2;
  const glyphSize = Math.min(wide ? w / (glyph!.length * 0.72) : h * 0.3, h * 0.3);
  const top = glyph ? (wide ? glyphSize * 1.2 : 0) : 0;
  const { size, items } = emojiGrid(puzzle.emojiCount, w * (glyph && !wide ? 0.92 : 1), top, h - top);
  return (
    <G>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={puzzle.art[0]} />
          <Stop offset="1" stopColor={puzzle.art[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${gradientId})`} />
      {items.map((it, i) => (
        <SvgText
          key={i}
          x={it.x}
          y={it.y + size * 0.36}
          fontSize={size * (puzzle.emojiCount === 1 ? 0.72 : 0.82)}
          textAnchor="middle"
        >
          {puzzle.emoji}
        </SvgText>
      ))}
      {glyph ? (
        <SvgText
          x={wide ? w / 2 : glyphSize * 0.62}
          y={glyphSize * 1.02}
          fontSize={glyphSize}
          fontFamily={fonts.black}
          textAnchor="middle"
          fill={colors.textDark}
          stroke={colors.white}
          strokeWidth={Math.max(2, glyphSize * 0.04)}
        >
          {glyph}
        </SvgText>
      ) : null}
    </G>
  );
});
