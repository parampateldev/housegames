import { describe, it, expect } from 'vitest';
import { dealRound, tallyVote, spyGuessCorrect } from '../../apps/web/src/games/spyfall/game';
import { LOCATIONS } from '../../apps/web/src/games/spyfall/locations';

const seeded = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

describe('dealRound', () => {
  it('assigns exactly one spy, and gives every other player a role at the same location', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const deal = dealRound(players, LOCATIONS, seeded(7));
    expect(players.includes(deal.spyId)).toBe(true);
    const nonSpies = players.filter((p) => p !== deal.spyId);
    for (const p of nonSpies) expect(deal.roles[p]).toBeTruthy();
    expect(deal.roles[deal.spyId]).toBeUndefined();
    expect(LOCATIONS.some((l) => l.name === deal.location)).toBe(true);
  });

  it('rejects fewer than 3 players', () => {
    expect(() => dealRound(['a', 'b'], LOCATIONS)).toThrow();
  });
});

describe('tallyVote', () => {
  it('accuses the majority target', () => {
    expect(tallyVote({ a: 'x', b: 'x', c: 'y' })).toEqual({ accusedId: 'x', tie: false });
  });
  it('reports a tie rather than guessing', () => {
    expect(tallyVote({ a: 'x', b: 'y' })).toEqual({ accusedId: null, tie: true });
  });
});

describe('spyGuessCorrect', () => {
  it('matches case- and whitespace-insensitively', () => {
    expect(spyGuessCorrect('  Airplane ', 'Airplane')).toBe(true);
    expect(spyGuessCorrect('bank', 'Bank')).toBe(true);
  });
  it('rejects a wrong guess', () => {
    expect(spyGuessCorrect('Beach', 'Bank')).toBe(false);
  });
});
