import { describe, it, expect } from 'vitest';
import { buildBoard, codenamesWinnerOnAssassinTap, remainingForTeam, checkWordsExhaustedWinner } from '../../apps/web/src/games/codenames/game';
import { CODENAMES_WORDS } from '../../apps/web/src/games/codenames/words';

const seeded = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

describe('word pool', () => {
  it('has at least 25 unique words', () => {
    expect(new Set(CODENAMES_WORDS).size).toBeGreaterThanOrEqual(25);
    expect(CODENAMES_WORDS.length).toBe(new Set(CODENAMES_WORDS).size);
  });
});

describe('buildBoard', () => {
  it('rejects a pool smaller than 25', () => {
    expect(() => buildBoard(['a', 'b'])).toThrow();
  });

  it('produces exactly 25 words and a matching 25-cell key with the right color counts', () => {
    const { words, key } = buildBoard(CODENAMES_WORDS, seeded(1));
    expect(words).toHaveLength(25);
    expect(key).toHaveLength(25);
    expect(key.filter((c) => c === 'assassin')).toHaveLength(1);
    expect(key.filter((c) => c === 'neutral')).toHaveLength(7);
    // starting team gets 9, other gets 8
    const redCount = key.filter((c) => c === 'red').length;
    const blueCount = key.filter((c) => c === 'blue').length;
    expect([redCount, blueCount].sort()).toEqual([8, 9]);
  });

  it('board words are unique (no duplicate on one board)', () => {
    const { words } = buildBoard(CODENAMES_WORDS, seeded(2));
    expect(new Set(words).size).toBe(25);
  });
});

describe('remainingForTeam / checkWordsExhaustedWinner', () => {
  it('counts unrevealed cells for a team', () => {
    const key = ['red', 'red', 'blue', 'neutral', 'assassin'] as const;
    const revealed = [true, false, false, false, false];
    expect(remainingForTeam(key as never, revealed, 'red')).toBe(1);
  });

  it('declares a winner once a team has zero remaining', () => {
    const key = ['red', 'blue', 'blue'] as const;
    const revealed = [true, false, false];
    expect(checkWordsExhaustedWinner(key as never, revealed)).toBe('red');
  });

  it('no winner while both teams still have unrevealed words', () => {
    const key = ['red', 'red', 'blue', 'blue'] as const;
    const revealed = [true, false, false, false];
    expect(checkWordsExhaustedWinner(key as never, revealed)).toBeNull();
  });
});

describe('codenamesWinnerOnAssassinTap', () => {
  it('the team that tapped the assassin loses, the other team wins', () => {
    expect(codenamesWinnerOnAssassinTap('red')).toBe('blue');
    expect(codenamesWinnerOnAssassinTap('blue')).toBe('red');
  });
});
