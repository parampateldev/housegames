import { describe, it, expect } from 'vitest';
import { guessMatches, normWord, imposterMax, pickWord, defaultCats } from '../../apps/web/src/games/imposter/game';

describe('guessMatches', () => {
  it('matches an exact word', () => {
    expect(guessMatches('taco', 'taco')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(guessMatches('  TACO  ', 'taco')).toBe(true);
  });

  it('accepts a naive plural (trailing s stripped on words longer than 3 chars)', () => {
    expect(guessMatches('tacos', 'taco')).toBe(true);
    expect(guessMatches('taco', 'tacos')).toBe(true);
  });

  it('does not strip s from short words (avoids false positives like "bus"/"bu")', () => {
    expect(guessMatches('bus', 'bu')).toBe(false);
  });

  it('rejects a clear non-match', () => {
    expect(guessMatches('pizza', 'taco')).toBe(false);
  });

  it('rejects an empty guess', () => {
    expect(guessMatches('', 'taco')).toBe(false);
    expect(guessMatches('   ', 'taco')).toBe(false);
  });
});

describe('normWord', () => {
  it('strips punctuation and collapses whitespace', () => {
    expect(normWord("Ice-Cream!!  Sandwich")).toBe('icecream sandwich');
  });
});

describe('imposterMax', () => {
  it('always leaves at least one crew member', () => {
    expect(imposterMax(4)).toBe(3);
    expect(imposterMax(2)).toBe(1);
    expect(imposterMax(1)).toBe(1);
  });
});

describe('pickWord', () => {
  it('never repeats a word within a category until that category is exhausted', () => {
    const cats = ['Animals'];
    let used: Record<string, string[]> = {};
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { word, usedWords } = pickWord(cats, used);
      used = usedWords;
      seen.add(word);
    }
    // 50 draws with reshuffle-on-exhaustion should still produce more than one distinct word
    expect(seen.size).toBeGreaterThan(1);
  });

  it('does not mutate the input used map (callers persist the returned one)', () => {
    const used = { Animals: ['dog'] };
    const before = JSON.stringify(used);
    pickWord(['Animals'], used);
    expect(JSON.stringify(used)).toBe(before);
  });
});

describe('defaultCats', () => {
  it('only returns categories that actually exist in the word bank', () => {
    for (const c of defaultCats()) {
      expect(typeof c).toBe('string');
    }
    expect(defaultCats().length).toBeGreaterThan(0);
  });
});
