/** Pure geometry for the jigsaw: piece outlines, layout and the snap test. */

export const SNAP_THRESHOLD = 30;
/** How far a tab reaches past a cell edge, as a fraction of the cell. */
export const TAB_RATIO = 0.26;
/** Extra room drawn around each cell so tabs are never cut off. */
export const MARGIN_RATIO = 0.3;

export type EdgeSign = -1 | 0 | 1;
export interface PieceEdges { top: EdgeSign; right: EdgeSign; bottom: EdgeSign; left: EdgeSign }
export interface Grid { cols: number; rows: number }
export interface Point { x: number; y: number }

// Alternating tabs and blanks. A shared edge always has opposite signs on its two pieces.
const verticalSeam = (col: number, row: number): EdgeSign => ((col + row) % 2 === 0 ? 1 : -1);
const horizontalSeam = (col: number, row: number): EdgeSign => ((col + row) % 2 === 0 ? -1 : 1);
const flip = (s: EdgeSign): EdgeSign => (s === 1 ? -1 : 1);

export function pieceEdges(col: number, row: number, { cols, rows }: Grid): PieceEdges {
  return {
    top: row === 0 ? 0 : flip(horizontalSeam(col, row - 1)),
    bottom: row === rows - 1 ? 0 : horizontalSeam(col, row),
    left: col === 0 ? 0 : flip(verticalSeam(col - 1, row)),
    right: col === cols - 1 ? 0 : verticalSeam(col, row),
  };
}

// Knob control points as [along edge, out of edge]; mirrored around 0.5 so neighbours match exactly.
const KNOB: [number, number][][] = [
  [[0.42, 0], [0.44, 0.06], [0.4, 0.1]],
  [[0.34, 0.18], [0.4, TAB_RATIO], [0.5, TAB_RATIO]],
  [[0.6, TAB_RATIO], [0.66, 0.18], [0.6, 0.1]],
  [[0.56, 0.06], [0.58, 0], [0.64, 0]],
];

const fmt = (n: number) => Number(n.toFixed(2));

function edgePath(from: Point, dx: number, dy: number, size: number, sign: EdgeSign): string {
  const at = (u: number, v: number) => {
    // The outward normal of a clockwise edge heading (dx, dy) is (dy, -dx).
    const x = from.x + dx * size * u + dy * size * v * sign;
    const y = from.y + dy * size * u - dx * size * v * sign;
    return `${fmt(x)} ${fmt(y)}`;
  };
  if (sign === 0) return `L ${at(1, 0)}`;
  const curves = KNOB.map((c) => `C ${at(c[0][0], c[0][1])} ${at(c[1][0], c[1][1])} ${at(c[2][0], c[2][1])}`);
  return [`L ${at(0.36, 0)}`, ...curves, `L ${at(1, 0)}`].join(' ');
}

/** SVG path for one piece, in board coordinates. */
export function piecePath(col: number, row: number, grid: Grid, cell: number): string {
  const e = pieceEdges(col, row, grid);
  const x = col * cell;
  const y = row * cell;
  return [
    `M ${fmt(x)} ${fmt(y)}`,
    edgePath({ x, y }, 1, 0, cell, e.top),
    edgePath({ x: x + cell, y }, 0, 1, cell, e.right),
    edgePath({ x: x + cell, y: y + cell }, -1, 0, cell, e.bottom),
    edgePath({ x, y: y + cell }, 0, -1, cell, e.left),
    'Z',
  ].join(' ');
}

export function isWithinSnap(dx: number, dy: number, threshold: number = SNAP_THRESHOLD): boolean {
  'worklet';
  return dx * dx + dy * dy <= threshold * threshold;
}

export interface PieceInfo { id: number; col: number; row: number }

export function makePieces({ cols, rows }: Grid): PieceInfo[] {
  return Array.from({ length: cols * rows }, (_, id) => ({ id, col: id % cols, row: Math.floor(id / cols) }));
}

export interface BoardLayout {
  cell: number;
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  /** Top of the band left free for the mascot between board and tray. */
  hintY: number;
  trayY: number;
  trayH: number;
  traySlot: number;
  perRow: number;
}

export function computeLayout(width: number, height: number, grid: Grid, loose: number, hintH: number): BoardLayout {
  const gutter = 16;
  const gap = 8;
  const rowsInTray = loose > 4 ? 2 : 1;
  const perRow = loose > 4 ? Math.ceil(loose / 2) : Math.max(loose, 1);
  const available = width - gutter * 2;
  // Tray slots stay big enough for small fingers, even if that means a smaller board.
  const minTray = 92 * rowsInTray;
  const maxBoardH = Math.max(height - hintH - minTray - gap * 3, 120);
  const cell = Math.floor(Math.min(available / grid.cols, maxBoardH / grid.rows));
  const boardW = cell * grid.cols;
  const boardH = cell * grid.rows;
  const boardY = gap;
  const hintY = boardY + boardH + gap;
  const trayY = hintY + hintH + gap;
  const trayH = Math.max(height - trayY, 0);
  const traySlot = Math.min(available / perRow, trayH / rowsInTray);
  return { cell, boardX: (width - boardW) / 2, boardY, boardW, boardH, hintY, trayY, trayH, traySlot, perRow };
}

/** Where a piece's centre sits when correctly placed. */
export function slotCenter(p: PieceInfo, l: BoardLayout): Point {
  return { x: l.boardX + (p.col + 0.5) * l.cell, y: l.boardY + (p.row + 0.5) * l.cell };
}

/** Centre of tray position `index`, keeping rows centred in the available width. */
export function trayCenter(index: number, total: number, width: number, l: BoardLayout): Point {
  const row = Math.floor(index / l.perRow);
  const inRow = Math.min(l.perRow, total - row * l.perRow);
  const col = index - row * l.perRow;
  const rows = Math.ceil(total / l.perRow);
  return {
    x: width / 2 + (col - (inRow - 1) / 2) * l.traySlot,
    y: l.trayY + l.trayH / 2 + (row - (rows - 1) / 2) * l.traySlot,
  };
}

/** Order-mixing that is stable per puzzle, and never leaves pieces in solved order. */
export function shuffledOrder(ids: number[], seed: string): number[] {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((v, i) => v === ids[i])) out.push(out.shift() as number);
  return out;
}

export type AgeTier = 3 | 4 | 5 | 6;

/** 2x2 boards start with one piece placed, leaving three for the child. Older tiers get more pieces. */
export function difficultyFor(age: AgeTier): { grid: Grid; prefilled: number[] } {
  if (age === 3 || age === 4) return { grid: { cols: 2, rows: 2 }, prefilled: [0] };
  return { grid: { cols: 3, rows: 2 }, prefilled: [] };
}

/** Never below two stars: mistakes are part of learning, not a failure. */
export const starsForMisses = (misses: number) => (misses <= 2 ? 3 : 2);
