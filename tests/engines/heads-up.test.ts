import { describe, it, expect } from 'vitest';
import { nextGuesser, audienceFor } from '../../apps/web/src/games/heads-up/game';

const players = [
  { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' },
];

describe('nextGuesser', () => {
  it('rotates through all players, wrapping around', () => {
    expect(nextGuesser(players, 'a')).toBe('b');
    expect(nextGuesser(players, 'c')).toBe('a');
  });
});

describe('audienceFor — the inverted-secrecy contract', () => {
  it('includes everyone except the guesser', () => {
    expect(audienceFor(players, 'b').sort()).toEqual(['a', 'c']);
  });
  it('never includes the guesser themself, even in a 2-player edge case', () => {
    const two = players.slice(0, 2);
    expect(audienceFor(two, 'a')).toEqual(['b']);
  });
});
