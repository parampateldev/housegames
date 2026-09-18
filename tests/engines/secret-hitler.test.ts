import { describe, it, expect } from 'vitest';
import {
  assignSecretHitlerRoles, buildPolicyDeck, drawCards, tallySHVote, checkSHWinner, nextPresident,
} from '../../apps/web/src/games/secret-hitler/game';

const seeded = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

describe('assignSecretHitlerRoles', () => {
  it('rejects player counts outside 5-10', () => {
    expect(() => assignSecretHitlerRoles(['a', 'b', 'c', 'd'])).toThrow();
    expect(() => assignSecretHitlerRoles(Array.from({ length: 11 }, (_, i) => `p${i}`))).toThrow();
  });

  it('exactly one Hitler, correct fascist count, rest liberal, at every valid size', () => {
    const table: Record<number, number> = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 };
    for (const [n, fascists] of Object.entries(table)) {
      const ids = Array.from({ length: Number(n) }, (_, i) => `p${i}`);
      const { roles } = assignSecretHitlerRoles(ids, seeded(Number(n)));
      const counts = { liberal: 0, fascist: 0, hitler: 0 };
      for (const r of Object.values(roles)) counts[r]++;
      expect(counts.hitler).toBe(1);
      expect(counts.fascist).toBe(fascists);
      expect(counts.liberal).toBe(Number(n) - fascists - 1);
    }
  });

  it('at 5-6 players, Hitler sees the fascist team', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const { roles, teamSeenBy, hitlerSeesTeam } = assignSecretHitlerRoles(ids, seeded(5));
    expect(hitlerSeesTeam).toBe(true);
    const hitlerUid = Object.keys(roles).find((id) => roles[id] === 'hitler')!;
    expect(teamSeenBy[hitlerUid]).toBeDefined();
    expect(teamSeenBy[hitlerUid].every((id) => roles[id] === 'fascist')).toBe(true);
  });

  it('at 7-10 players, Hitler does NOT see the fascist team', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `p${i}`);
    const { roles, teamSeenBy, hitlerSeesTeam } = assignSecretHitlerRoles(ids, seeded(7));
    expect(hitlerSeesTeam).toBe(false);
    const hitlerUid = Object.keys(roles).find((id) => roles[id] === 'hitler')!;
    expect(teamSeenBy[hitlerUid]).toBeUndefined();
  });

  it('every fascist sees every other fascist AND Hitler, regardless of player count', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const { roles, teamSeenBy } = assignSecretHitlerRoles(ids, seeded(9));
    const fascists = Object.keys(roles).filter((id) => roles[id] === 'fascist');
    const hitlerUid = Object.keys(roles).find((id) => roles[id] === 'hitler')!;
    for (const f of fascists) {
      expect(teamSeenBy[f]).toContain(hitlerUid);
      for (const other of fascists) if (other !== f) expect(teamSeenBy[f]).toContain(other);
    }
  });
});

describe('buildPolicyDeck', () => {
  it('is always 6 liberal + 11 fascist = 17 cards', () => {
    const deck = buildPolicyDeck(seeded(1));
    expect(deck).toHaveLength(17);
    expect(deck.filter((c) => c === 'liberal')).toHaveLength(6);
    expect(deck.filter((c) => c === 'fascist')).toHaveLength(11);
  });
});

describe('drawCards', () => {
  it('draws in order without reshuffling when cards remain', () => {
    const deck = buildPolicyDeck(seeded(2));
    const { cards, nextDrawIndex } = drawCards(deck, 0, 3, seeded(3));
    expect(cards).toEqual(deck.slice(0, 3));
    expect(nextDrawIndex).toBe(3);
  });

  it('reshuffles into a fresh full deck once the current one runs out', () => {
    const deck = buildPolicyDeck(seeded(4));
    const { cards, nextDeck, nextDrawIndex } = drawCards(deck, 16, 3, seeded(5));
    expect(cards).toHaveLength(3);
    expect(nextDeck).toHaveLength(17);
    expect(nextDrawIndex).toBe(3);
  });
});

describe('tallySHVote', () => {
  it('passes on a clear ja majority', () => {
    expect(tallySHVote({ a: 'ja', b: 'ja', c: 'nein' }).passed).toBe(true);
  });
  it('fails on a tie', () => {
    expect(tallySHVote({ a: 'ja', b: 'nein' }).passed).toBe(false);
  });
  it('fails on a nein majority', () => {
    expect(tallySHVote({ a: 'nein', b: 'nein', c: 'ja' }).passed).toBe(false);
  });
});

describe('checkSHWinner', () => {
  it('liberals win at 5 liberal policies', () => {
    expect(checkSHWinner({ liberalPolicies: 5, fascistPolicies: 2, chancellorId: null, roles: {} })).toBe('liberal');
  });
  it('fascists win at 6 fascist policies', () => {
    expect(checkSHWinner({ liberalPolicies: 2, fascistPolicies: 6, chancellorId: null, roles: {} })).toBe('fascist');
  });
  it('fascists win if Hitler is elected chancellor after 3+ fascist policies', () => {
    expect(checkSHWinner({ liberalPolicies: 1, fascistPolicies: 3, chancellorId: 'h', roles: { h: 'hitler' } })).toBe('fascist');
  });
  it('electing Hitler chancellor BEFORE 3 fascist policies does not end the game', () => {
    expect(checkSHWinner({ liberalPolicies: 1, fascistPolicies: 2, chancellorId: 'h', roles: { h: 'hitler' } })).toBeNull();
  });
  it('no winner yet mid-game', () => {
    expect(checkSHWinner({ liberalPolicies: 2, fascistPolicies: 2, chancellorId: null, roles: {} })).toBeNull();
  });
});

describe('nextPresident', () => {
  it('rotates to the next uid in order, wrapping around', () => {
    const order = ['a', 'b', 'c'];
    expect(nextPresident(order, 'a')).toBe('b');
    expect(nextPresident(order, 'c')).toBe('a');
  });
});
