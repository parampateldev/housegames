// Pure logic for Codenames, board setup and win checks. The one rule that
// matters: the color KEY this module produces must only ever be written to
// the two spymasters' own secret paths (see firebase.ts), never public,
// never host-only-shared, never even transiently. This file just computes
// values; it has no idea where they end up, that discipline lives in
// firebase.ts.

export type TeamColor = 'red' | 'blue';
export type CellColor = TeamColor | 'neutral' | 'assassin';

export type BoardSetup = {
  words: string[]; // 25
  key: CellColor[]; // 25, index-aligned with words
  startingTeam: TeamColor;
};

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildBoard(wordPool: string[], rng: () => number = Math.random): BoardSetup {
  if (wordPool.length < 25) throw new Error('Word pool must have at least 25 words');
  const words = shuffle(wordPool, rng).slice(0, 25);
  const startingTeam: TeamColor = rng() < 0.5 ? 'red' : 'blue';
  const otherTeam: TeamColor = startingTeam === 'red' ? 'blue' : 'red';

  const colors: CellColor[] = [
    ...Array(9).fill(startingTeam),
    ...Array(8).fill(otherTeam),
    ...Array(7).fill('neutral'),
    'assassin',
  ];
  const key = shuffle(colors, rng);
  return { words, key, startingTeam };
}

export function remainingForTeam(key: CellColor[], revealed: boolean[], team: TeamColor): number {
  return key.filter((c, i) => c === team && !revealed[i]).length;
}

/** Call after every reveal that ISN'T the assassin, checks the "ran out of words" win condition. */
export function checkWordsExhaustedWinner(key: CellColor[], revealed: boolean[]): TeamColor | null {
  if (remainingForTeam(key, revealed, 'red') === 0) return 'red';
  if (remainingForTeam(key, revealed, 'blue') === 0) return 'blue';
  return null;
}

/** Tapping the assassin ends the game immediately: whoever tapped it LOSES. */
export function codenamesWinnerOnAssassinTap(tappingTeam: TeamColor): TeamColor {
  return tappingTeam === 'red' ? 'blue' : 'red';
}
