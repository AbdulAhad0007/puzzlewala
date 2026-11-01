export type SetId = 'alphabet' | 'numbers' | 'animals' | 'fruits' | 'shapes' | 'colors' | 'words' | 'hindi';
export type SpeechLang = 'en-IN' | 'hi-IN';

export interface Puzzle {
  id: string;
  setId: SetId;
  /** Display name, e.g. "A for Apple". */
  title: string;
  /** Short tile caption, e.g. "A" or "Lion". */
  short: string;
  emoji: string;
  /** How many copies of the emoji the artwork shows. */
  emojiCount: number;
  /** Big glyph painted on the artwork, if any. */
  glyph?: string;
  /** Text read aloud by the speaker button. */
  speak: string;
  /** Sound the letter makes, shown on the completion screen. */
  phonic?: string;
  lang: SpeechLang;
  /** Artwork background gradient. */
  art: [string, string];
}

const ART: [string, string][] = [
  ['#BFE6FF', '#EAF7FF'], ['#FFE3A8', '#FFF6DE'], ['#FFD0DD', '#FFF0F4'],
  ['#C6F2D6', '#EFFCF4'], ['#DBD0FF', '#F4F0FF'],
];
const artFor = (i: number) => ART[i % ART.length];

const ALPHABET: [string, string, string][] = [
  ['Apple', '🍎', '/æ/'], ['Ball', '⚽', '/b/'], ['Cat', '🐱', '/k/'], ['Dog', '🐶', '/d/'],
  ['Elephant', '🐘', '/ɛ/'], ['Fish', '🐟', '/f/'], ['Grapes', '🍇', '/g/'], ['Hat', '🎩', '/h/'],
  ['Ice cream', '🍦', '/aɪ/'], ['Juice', '🧃', '/dʒ/'], ['Kite', '🪁', '/k/'], ['Lion', '🦁', '/l/'],
  ['Mango', '🥭', '/m/'], ['Nest', '🪺', '/n/'], ['Orange', '🍊', '/ɒ/'], ['Parrot', '🦜', '/p/'],
  ['Queen', '👸', '/kw/'], ['Rabbit', '🐰', '/r/'], ['Sun', '☀️', '/s/'], ['Tiger', '🐯', '/t/'],
  ['Umbrella', '☂️', '/ʌ/'], ['Van', '🚐', '/v/'], ['Watch', '⌚', '/w/'], ['Xylophone', '🎶', '/z/'],
  ['Yak', '🐃', '/j/'], ['Zebra', '🦓', '/z/'],
];

export const alphabetPuzzles: Puzzle[] = ALPHABET.map(([word, emoji, phonic], i) => {
  const letter = String.fromCharCode(65 + i);
  return {
    id: `alphabet-${letter}`, setId: 'alphabet', title: `${letter} for ${word}`, short: letter,
    emoji, emojiCount: 1, glyph: letter, speak: `${letter} for ${word}`, phonic, lang: 'en-IN', art: artFor(i),
  };
});

const COUNTING: [string, string][] = [
  ['Sun', '☀️'], ['Puppies', '🐶'], ['Butterflies', '🦋'], ['Balloons', '🎈'], ['Flowers', '🌸'],
  ['Apples', '🍎'], ['Fish', '🐟'], ['Cars', '🚗'], ['Stars', '⭐'], ['Ducks', '🦆'],
];

export const numberPuzzles: Puzzle[] = Array.from({ length: 100 }, (_, i) => {
  const n = i + 1;
  const [word, emoji] = COUNTING[i % COUNTING.length];
  const name = n > 1 && word === 'Sun' ? 'Suns' : word;
  return {
    id: `numbers-${n}`, setId: 'numbers', title: `${n} ${name}`, short: String(n), emoji,
    emojiCount: Math.min(n, 10), glyph: String(n), speak: `${n} ${name}`, lang: 'en-IN', art: artFor(i),
  };
});

const named = (setId: SetId, rows: [string, string][]): Puzzle[] =>
  rows.map(([name, emoji], i) => ({
    id: `${setId}-${name.toLowerCase().replace(/\s+/g, '-')}`, setId, title: name, short: name, emoji,
    emojiCount: 1, speak: name, lang: 'en-IN' as const, art: artFor(i),
  }));

export const animalPuzzles = named('animals', [
  ['Lion', '🦁'], ['Elephant', '🐘'], ['Tiger', '🐯'], ['Monkey', '🐵'], ['Giraffe', '🦒'],
  ['Zebra', '🦓'], ['Panda', '🐼'], ['Rhino', '🦏'], ['Camel', '🐫'], ['Peacock', '🦚'],
]);
export const fruitPuzzles = named('fruits', [
  ['Strawberry', '🍓'], ['Mango', '🥭'], ['Banana', '🍌'], ['Apple', '🍎'], ['Grapes', '🍇'],
  ['Orange', '🍊'], ['Watermelon', '🍉'], ['Pineapple', '🍍'], ['Cherry', '🍒'], ['Pear', '🍐'],
]);
export const shapePuzzles = named('shapes', [
  ['Circle', '🔴'], ['Square', '🟦'], ['Triangle', '🔺'], ['Diamond', '🔷'], ['Star', '⭐'],
  ['Heart', '❤️'], ['Crescent', '🌙'], ['Oval', '🥚'], ['Rectangle', '🚪'], ['Cross', '➕'],
]);
export const colorPuzzles = named('colors', [
  ['Red', '🍎'], ['Blue', '🐳'], ['Green', '🐸'], ['Yellow', '🍌'], ['Orange', '🥕'],
  ['Pink', '🌸'], ['Purple', '🍆'], ['Brown', '🐻'], ['Black', '🎱'], ['White', '🐑'],
]);
export const wordPuzzles: Puzzle[] = named('words', [
  ['CAT', '🐱'], ['DOG', '🐶'], ['SUN', '☀️'], ['BUS', '🚌'], ['HEN', '🐔'],
  ['CUP', '☕'], ['BED', '🛏️'], ['PEN', '🖊️'], ['FISH', '🐟'], ['STAR', '⭐'],
]).map((p) => ({ ...p, glyph: p.title, speak: `${p.title.split('').join(', ')}. ${p.title}` }));

const HINDI: [string, string, string][] = [
  ['अ', 'अनानास', '🍍'], ['आ', 'आम', '🥭'], ['इ', 'इंजन', '🚂'], ['ई', 'ईंट', '🧱'],
  ['उ', 'उल्लू', '🦉'], ['ऊ', 'ऊन', '🧶'], ['ए', 'एड़ी', '🦶'], ['ऐ', 'ऐनक', '👓'],
  ['ओ', 'ओला', '🧊'], ['औ', 'औरत', '👩'], ['अं', 'अंगूर', '🍇'],
];
export const hindiPuzzles: Puzzle[] = HINDI.map(([letter, word, emoji], i) => ({
  id: `hindi-${i + 1}`, setId: 'hindi', title: `${letter} से ${word}`, short: letter, emoji, emojiCount: 1,
  glyph: letter, speak: `${letter} से ${word}`, lang: 'hi-IN', art: artFor(i),
}));

export interface PuzzleSet {
  id: SetId;
  emoji: string;
  color: string;
  soft: string;
  puzzles: Puzzle[];
}

export const SETS: Record<SetId, PuzzleSet> = {
  alphabet: { id: 'alphabet', emoji: '🔤', color: '#56B7F5', soft: '#DCF0FE', puzzles: alphabetPuzzles },
  numbers: { id: 'numbers', emoji: '🔢', color: '#FFD166', soft: '#FFF4D6', puzzles: numberPuzzles },
  animals: { id: 'animals', emoji: '🦁', color: '#FFB36B', soft: '#FFEEDD', puzzles: animalPuzzles },
  fruits: { id: 'fruits', emoji: '🍓', color: '#FF8FAB', soft: '#FFE6ED', puzzles: fruitPuzzles },
  shapes: { id: 'shapes', emoji: '🔷', color: '#B8A2F8', soft: '#EEE9FE', puzzles: shapePuzzles },
  colors: { id: 'colors', emoji: '🎨', color: '#80DFA3', soft: '#E0F8E9', puzzles: colorPuzzles },
  words: { id: 'words', emoji: '📝', color: '#7FD6D6', soft: '#E0F7F7', puzzles: wordPuzzles },
  hindi: { id: 'hindi', emoji: 'अ', color: '#F7A072', soft: '#FFEDE3', puzzles: hindiPuzzles },
};

export const PICTURE_WORLDS: SetId[] = ['animals', 'fruits', 'shapes', 'colors'];

export const NUMBER_RANGES = [
  { key: '1-10', from: 1, to: 10 },
  { key: '11-20', from: 11, to: 20 },
  { key: '21-50', from: 21, to: 50 },
  { key: '51-100', from: 51, to: 100 },
] as const;

const BY_ID = new Map(Object.values(SETS).flatMap((s) => s.puzzles).map((p) => [p.id, p]));

export function getPuzzle(id: string): Puzzle {
  const puzzle = BY_ID.get(id);
  if (!puzzle) throw new Error(`Unknown puzzle: ${id}`);
  return puzzle;
}

export function nextPuzzleInSet(id: string): Puzzle | undefined {
  const { puzzles } = SETS[getPuzzle(id).setId];
  return puzzles[puzzles.findIndex((p) => p.id === id) + 1];
}

export type SolvedMap = Record<string, number>;
export type LevelState = 'completed' | 'active' | 'locked';

/** Levels unlock in order: everything solved is completed, the first unsolved is active. */
export function levelState(puzzle: Puzzle, solved: SolvedMap): LevelState {
  if (solved[puzzle.id]) return 'completed';
  return firstOpenPuzzle(puzzle.setId, solved)?.id === puzzle.id ? 'active' : 'locked';
}

export const solvedCount = (setId: SetId, solved: SolvedMap) =>
  SETS[setId].puzzles.filter((p) => solved[p.id]).length;

export const countStars = (solved: SolvedMap) => Object.values(solved).reduce((a, b) => a + b, 0);

export function firstOpenPuzzle(setId: SetId, solved: SolvedMap): Puzzle | undefined {
  return SETS[setId].puzzles.find((p) => !solved[p.id]);
}

export interface Badge {
  id: string;
  name: string;
  nameHi: string;
  emoji: string;
  goal: string;
  goalHi: string;
  earned: (solved: SolvedMap) => boolean;
}

export const BADGES: Badge[] = [
  { id: 'first', name: 'First Puzzle', nameHi: 'पहली पहेली', emoji: '🧩', goal: 'Finish 1 puzzle', goalHi: '1 पहेली पूरी करो', earned: (s) => Object.keys(s).length >= 1 },
  { id: 'letters', name: 'Letter Master', nameHi: 'अक्षर उस्ताद', emoji: '🔤', goal: 'Finish A to Z', goalHi: 'A से Z पूरा करो', earned: (s) => solvedCount('alphabet', s) >= 26 },
  { id: 'safari', name: 'Safari Explorer', nameHi: 'सफ़ारी खोजी', emoji: '🦁', goal: 'Finish 5 animals', goalHi: '5 जानवर पूरे करो', earned: (s) => solvedCount('animals', s) >= 5 },
  { id: 'counting', name: 'Counting Champ', nameHi: 'गिनती चैंपियन', emoji: '🔢', goal: 'Finish 1 to 10', goalHi: '1 से 10 पूरा करो', earned: (s) => solvedCount('numbers', s) >= 10 },
  { id: 'fruits', name: 'Fruit Friend', nameHi: 'फलों का दोस्त', emoji: '🍓', goal: 'Finish 5 fruits', goalHi: '5 फल पूरे करो', earned: (s) => solvedCount('fruits', s) >= 5 },
  { id: 'shapes', name: 'Shape Wizard', nameHi: 'आकार जादूगर', emoji: '🔷', goal: 'Finish 5 shapes', goalHi: '5 आकार पूरे करो', earned: (s) => solvedCount('shapes', s) >= 5 },
  { id: 'words', name: 'Word Builder', nameHi: 'शब्द निर्माता', emoji: '📝', goal: 'Finish 5 words', goalHi: '5 शब्द पूरे करो', earned: (s) => solvedCount('words', s) >= 5 },
  { id: 'stars', name: 'Star Collector', nameHi: 'सितारा संग्रहकर्ता', emoji: '🌟', goal: 'Win 50 stars', goalHi: '50 सितारे जीतो', earned: (s) => countStars(s) >= 50 },
];

export const earnedBadgeIds = (solved: SolvedMap) => BADGES.filter((b) => b.earned(solved)).map((b) => b.id);
