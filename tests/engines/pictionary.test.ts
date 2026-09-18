import { describe, it, expect } from 'vitest';
import {
  decimateStroke, pickWord, nextArtist, checkGuess,
} from '../../apps/web/src/games/pictionary/game';
import { WORD_BANK } from '../../apps/web/src/games/pictionary/words';

describe('decimateStroke', () => {
  it('leaves short strokes untouched', () => {
    const points: [number, number][] = [[0, 0], [0.1, 0.1], [0.2, 0.2]];
    expect(decimateStroke(points, 300)).toEqual(points);
  });

  it('caps long strokes at the max, keeping first and last points', () => {
    const points: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i / 1000, i / 1000]);
    const out = decimateStroke(points, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('never produces a write bigger than requested regardless of input size', () => {
    const points: [number, number][] = Array.from({ length: 5000 }, (_, i) => [i, i]);
    expect(decimateStroke(points, 50).length).toBeLessThanOrEqual(50);
  });
});

describe('pickWord', () => {
  const allWords = Object.values(WORD_BANK).flat();

  it('never returns a word already in the used list while unused words remain', () => {
    const used = allWords.slice(0, allWords.length - 1);
    const { word } = pickWord(used);
    expect(word).toBe(allWords[allWords.length - 1]);
  });

  it('reshuffles (picks something) once every word has been used', () => {
    const { word } = pickWord(allWords);
    expect(allWords).toContain(word);
  });

  it('always returns a word paired with its real category', () => {
    for (let i = 0; i < 20; i++) {
      const { word, category } = pickWord([]);
      expect(WORD_BANK[category]).toContain(word);
    }
  });
});

describe('nextArtist', () => {
  it('rotates to the next player in deterministic (sorted) order', () => {
    const players = ['b', 'a', 'c'];
    expect(nextArtist(players, 'a')).toBe('b');
    expect(nextArtist(players, 'b')).toBe('c');
  });

  it('wraps around after the last player', () => {
    expect(nextArtist(['a', 'b', 'c'], 'c')).toBe('a');
  });

  it('throws rather than silently failing when there are no players', () => {
    expect(() => nextArtist([], 'a')).toThrow();
  });
});

describe('checkGuess', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(checkGuess('  Guitar ', 'guitar')).toBe(true);
  });

  it('rejects a wrong guess', () => {
    expect(checkGuess('banjo', 'guitar')).toBe(false);
  });
});
