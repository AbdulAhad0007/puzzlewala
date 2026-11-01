import { DatabaseSync } from 'node:sqlite';
import { isOverPlayLimit, useAppStore, FIRST_SOLVE_COINS, QUEST_REWARD, REPLAY_COINS } from '../context/useAppStore';
import {
  alphabetPuzzles, firstOpenPuzzle, getPuzzle, levelState, nextPuzzleInSet, numberPuzzles, SETS,
} from '../data/puzzles';
import { listProfiles, loadChildState } from '../services/gameRepository';
import { SoundService } from '../services/SoundService';
import { getDb, useDriverForTests, type SqlDriver } from '../services/storage/localDatabase';
import {
  computeLayout, difficultyFor, isWithinSnap, makePieces, pieceEdges, piecePath, shuffledOrder,
  slotCenter, SNAP_THRESHOLD, starsForMisses, trayCenter,
} from '../utils/jigsaw';
import { makeQuestion } from '../utils/mathGate';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  randomUUID: () => require('crypto').randomUUID(),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getRandomBytes: (n: number) => require('crypto').randomBytes(n),
}));
jest.mock('../services/audioBackend', () => ({
  expoBackend: {
    init: jest.fn(async () => undefined), playEffect: jest.fn(), setMusicPlaying: jest.fn(),
    speak: jest.fn(), stopSpeaking: jest.fn(), haptic: jest.fn(),
  },
}));
const backend = jest.requireMock('../services/audioBackend').expoBackend;

function sqliteDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  return {
    exec: async (sql) => { db.exec(sql); },
    run: async (sql, params) => { db.prepare(sql).run(...params); },
    all: async <T,>(sql: string, params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
  };
}

const store = () => useAppStore.getState();
const active = () => store().profiles[store().activeProfileId as string];
const settled = async () => { await (await getDb()).all('SELECT 1'); };

describe('jigsaw geometry', () => {
  it.each([[2, 2], [3, 2]])('every shared %ix%i edge is one tab and one blank; borders are flat', (cols: number, rows: number) => {
    const grid = { cols, rows };
    for (const { col, row } of makePieces(grid)) {
      const e = pieceEdges(col, row, grid);
      if (col < cols - 1) expect(e.right + pieceEdges(col + 1, row, grid).left).toBe(0);
      if (row < rows - 1) expect(e.bottom + pieceEdges(col, row + 1, grid).top).toBe(0);
      if (col < cols - 1) expect(e.right).not.toBe(0);
      if (row < rows - 1) expect(e.bottom).not.toBe(0);
      if (row === 0) expect(e.top).toBe(0);
      if (col === 0) expect(e.left).toBe(0);
      if (row === rows - 1) expect(e.bottom).toBe(0);
      if (col === cols - 1) expect(e.right).toBe(0);
    }
  });

  it('neighbouring pieces share the same knob curve points', () => {
    const grid = { cols: 2, rows: 2 };
    const coords = (p: string) => new Set(p.match(/-?\d+(\.\d+)? -?\d+(\.\d+)?/g));
    const left = coords(piecePath(0, 0, grid, 100));
    const right = coords(piecePath(1, 0, grid, 100));
    expect([...left].filter((c) => right.has(c)).length).toBeGreaterThanOrEqual(13);
  });

  it('snaps at exactly the threshold and not beyond', () => {
    expect(SNAP_THRESHOLD).toBe(30);
    expect(isWithinSnap(18, 24)).toBe(true);
    expect(isWithinSnap(21, 22)).toBe(false);
  });

  it('keeps board and tray on screen on a small phone', () => {
    for (const grid of [{ cols: 2, rows: 2 }, { cols: 3, rows: 2 }]) {
      const n = grid.cols * grid.rows;
      const l = computeLayout(320, 500, grid, n, 64);
      expect(l.boardX).toBeGreaterThanOrEqual(0);
      expect(l.trayY + l.trayH).toBeLessThanOrEqual(500);
      expect(l.traySlot).toBeGreaterThanOrEqual(44);
      for (const p of makePieces(grid)) expect(slotCenter(p, l).x).toBeLessThan(320);
      for (let i = 0; i < n; i++) {
        const c = trayCenter(i, n, 320, l);
        expect(c.x - l.traySlot / 2).toBeGreaterThanOrEqual(0);
        expect(c.x + l.traySlot / 2).toBeLessThanOrEqual(320);
        expect(c.y + l.traySlot / 2).toBeLessThanOrEqual(500.01);
      }
    }
  });

  it('shuffles stably and never in solved order', () => {
    for (const p of alphabetPuzzles) {
      const ids = [0, 1, 2, 3];
      const a = shuffledOrder(ids, p.id);
      expect(a).toEqual(shuffledOrder(ids, p.id));
      expect([...a].sort()).toEqual(ids);
      expect(a).not.toEqual(ids);
    }
  });

  it('gives younger children an easier board and never below two stars', () => {
    expect(difficultyFor(3).prefilled).toHaveLength(1);
    expect(difficultyFor(4).prefilled).toHaveLength(1);
    expect(difficultyFor(5).grid.cols).toBe(3);
    expect(starsForMisses(0)).toBe(3);
    expect(starsForMisses(99)).toBe(2);
  });
});

describe('math gate', () => {
  it('produces correct single-digit questions', () => {
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion();
      const [, a, op, b] = q.text.match(/(\d) ([+×]) (\d) = \?/) as RegExpMatchArray;
      expect(q.answer).toBe(op === '+' ? +a + +b : +a * +b);
    }
  });
});

describe('puzzle data', () => {
  it('has the promised counts and unique ids', () => {
    expect(alphabetPuzzles).toHaveLength(26);
    expect(numberPuzzles).toHaveLength(100);
    const pictures = ['animals', 'fruits', 'shapes', 'colors'] as const;
    expect(pictures.reduce((sum, id) => sum + SETS[id].puzzles.length, 0)).toBe(40);
    const all = Object.values(SETS).flatMap((s) => s.puzzles.map((p) => p.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('walks levels in order', () => {
    const solved = { 'alphabet-A': 3, 'alphabet-B': 3 };
    expect(levelState(getPuzzle('alphabet-A'), solved)).toBe('completed');
    expect(levelState(getPuzzle('alphabet-C'), solved)).toBe('active');
    expect(levelState(getPuzzle('alphabet-D'), solved)).toBe('locked');
    expect(firstOpenPuzzle('alphabet', solved)?.id).toBe('alphabet-C');
    expect(nextPuzzleInSet('alphabet-Z')).toBeUndefined();
  });
});

describe('store on real SQLite', () => {
  const day = (d: number) => new Date(2026, 5, d, 12);
  const child = { nickname: '  Ahad ', ageGroup: '4-5', gender: null, avatarId: 'lion' } as const;

  beforeEach(async () => {
    useDriverForTests(sqliteDriver());
    useAppStore.setState({ profiles: {}, activeProfileId: null, daily: {} });
    await store().createChild(child);
  });

  it('starts a new child blank, with no hardcoded progress or name', () => {
    expect(active().solved).toEqual({});
    expect(active().name).toBe('Ahad');
    expect(active().displayId).toMatch(/^PW-[23456789A-HJ-NP-Z]{6}$/);
    expect(levelState(getPuzzle('alphabet-A'), active().solved)).toBe('active');
  });

  it('maps age groups onto difficulty', async () => {
    await store().updateChild(active().id, { ...child, ageGroup: '3-4' });
    expect(difficultyFor(active().ageTier).prefilled).toHaveLength(1);
    await store().updateChild(active().id, { ...child, ageGroup: '5-6' });
    expect(difficultyFor(active().ageTier).grid.cols).toBe(3);
  });

  it('pays more for a first solve, keeps the best stars, and survives a reload', async () => {
    expect(store().completePuzzle('alphabet-A', 3, day(1)).coins).toBe(FIRST_SOLVE_COINS);
    expect(store().completePuzzle('alphabet-A', 2, day(1)).coins).toBe(REPLAY_COINS);
    await settled();
    expect(active().solved['alphabet-A']).toBe(3);
    await store().reloadFromLocal();
    expect(active().solved['alphabet-A']).toBe(3);
    expect(active().coins).toBe(FIRST_SOLVE_COINS + REPLAY_COINS);
  });

  it('unlocks a badge once only', () => {
    expect(store().completePuzzle('alphabet-A', 3, day(1)).newBadgeId).toBe('first');
    expect(store().completePuzzle('alphabet-B', 3, day(1)).newBadgeId).toBeUndefined();
  });

  it('pays the daily quest once, and the total survives a reload', async () => {
    ['alphabet-A', 'alphabet-B', 'alphabet-C', 'alphabet-D'].forEach((id) => store().completePuzzle(id, 3, day(1)));
    const expected = FIRST_SOLVE_COINS * 4 + QUEST_REWARD;
    expect(active().coins).toBe(expected);
    await settled();
    await store().reloadFromLocal();
    expect(active().coins).toBe(expected);
  });

  it('counts streaks by consecutive days and restarts after a gap', () => {
    store().completePuzzle('alphabet-A', 3, day(1));
    store().completePuzzle('alphabet-B', 3, day(1));
    expect(active().streak).toBe(1);
    store().completePuzzle('alphabet-C', 3, day(2));
    expect(active().streak).toBe(2);
    store().completePuzzle('alphabet-D', 3, day(5));
    expect(active().streak).toBe(1);
  });

  it('enforces the play limit, honours bonus time, and starts fresh the next day', () => {
    store().addPlaySeconds(30 * 60, day(1));
    expect(isOverPlayLimit(active(), 30, day(1))).toBe(true);
    store().grantBonusTime(day(1));
    expect(isOverPlayLimit(active(), 30, day(1))).toBe(false);
    expect(isOverPlayLimit(active(), 30, day(2))).toBe(false);
  });

  it('a None limit never ends play, and is saved per child', async () => {
    store().addPlaySeconds(24 * 60 * 60, day(1));
    expect(isOverPlayLimit(active(), 60, day(1))).toBe(true);
    expect(isOverPlayLimit(active(), 'none', day(1))).toBe(false);
    store().setPref({ playLimit: 'none' });
    await settled();
    expect((await loadChildState(active().id)).settings.play_limit_minutes).toBe('none');
  });

  it('keeps each child separate, including settings', async () => {
    const first = active().id;
    store().completePuzzle('alphabet-A', 3, day(1));
    store().setPref({ sfx: false, fullscreen: true });
    const second = await store().createChild({ ...child, nickname: 'Sara' });
    expect(active().id).toBe(second.id);
    expect(active().solved['alphabet-A']).toBeUndefined();
    expect(store().sfx).toBe(true);
    store().switchProfile(first);
    expect(store().sfx).toBe(false);
    expect(store().fullscreen).toBe(true);
    await settled();
    expect((await loadChildState(first)).settings.fullscreen_enabled).toBe(true);
  });

  it('saves an unfinished puzzle and clears it on completion', async () => {
    const data = {
      current_category: 'alphabet', current_level: 'alphabet-C', placed_piece_ids: [0, 3], remaining_piece_ids: [1, 2],
      puzzle_progress: 0.5, current_score: 3, misses: 1, cols: 2, rows: 2,
    };
    store().savePuzzleSession(data);
    await settled();
    await store().reloadFromLocal();
    expect(active().session).toEqual(data);
    store().completePuzzle('alphabet-C', 3, day(1));
    await settled();
    await store().reloadFromLocal();
    expect(active().session).toBeNull();
  });

  it('resets one child without touching another, and does not restore starter data', async () => {
    const first = active().id;
    store().completePuzzle('alphabet-A', 3, day(1));
    const second = await store().createChild({ ...child, nickname: 'Sara' });
    store().completePuzzle('alphabet-B', 3, day(1));
    store().resetProgress();
    await settled();
    expect((await loadChildState(second.id)).solved).toEqual({});
    expect((await loadChildState(second.id)).coins).toBe(0);
    expect((await loadChildState(first)).solved['alphabet-A']).toBe(3);
  });

  it('deletes a child and falls back to another, or to onboarding when none remain', async () => {
    const first = active().id;
    const second = await store().createChild({ ...child, nickname: 'Sara' });
    await store().deleteChild(second.id);
    expect(store().activeProfileId).toBe(first);
    await store().deleteChild(first);
    expect(store().activeProfileId).toBeNull();
    expect(await listProfiles()).toEqual([]);
  });
});

describe('SoundService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('silences effects and instructions when toggled off, but honours a speaker tap', () => {
    SoundService.applyPrefs({ sfx: false, music: true, voice: false });
    SoundService.play('snap');
    SoundService.instruct('hello', 'en-IN');
    expect(backend.playEffect).not.toHaveBeenCalled();
    expect(backend.speak).not.toHaveBeenCalled();
    SoundService.pronounce('A for Apple', 'en-IN');
    expect(backend.speak).toHaveBeenCalledTimes(1);
    SoundService.applyPrefs({ sfx: true, music: true, voice: true });
    SoundService.play('snap');
    expect(backend.playEffect).toHaveBeenCalledWith('snap');
  });

  it('plays music only after unlock, only when on, and pauses in the background', async () => {
    await SoundService.unlock();
    expect(backend.setMusicPlaying).toHaveBeenLastCalledWith(true);
    SoundService.setForeground(false);
    expect(backend.setMusicPlaying).toHaveBeenLastCalledWith(false);
    SoundService.setForeground(true);
    SoundService.applyPrefs({ sfx: true, music: false, voice: true });
    expect(backend.setMusicPlaying).toHaveBeenLastCalledWith(false);
  });
});
