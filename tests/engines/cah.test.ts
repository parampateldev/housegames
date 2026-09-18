import { describe, it, expect } from 'vitest';
import { drawCards, dealHands, nextCzar, anonymizeSubmissions } from '../../apps/web/src/games/cah/game';
import { BLACK_CARDS, WHITE_CARDS } from '../../apps/web/src/games/cah/cards';

const seeded = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

describe('card content', () => {
  it('has enough black and white cards for a real game', () => {
    expect(BLACK_CARDS.length).toBeGreaterThanOrEqual(30);
    expect(WHITE_CARDS.length).toBeGreaterThanOrEqual(100);
  });
});

describe('drawCards', () => {
  it('draws in sequence without repeats while the deck has cards left', () => {
    const deck = ['a', 'b', 'c', 'd', 'e'];
    const first = drawCards(deck, 0, 2, deck, seeded(1));
    expect(first.cards).toEqual(['a', 'b']);
    const second = drawCards(first.nextDeck, first.nextDrawIndex, 2, deck, seeded(2));
    expect(second.cards).toEqual(['c', 'd']);
  });

  it('reshuffles a fresh deck once exhausted rather than dealing past the end', () => {
    const deck = ['a', 'b', 'c'];
    const { cards, nextDeck } = drawCards(deck, 2, 2, deck, seeded(3));
    expect(cards).toHaveLength(2);
    expect(nextDeck).toHaveLength(3);
  });
});

describe('dealHands', () => {
  it('deals every player a full hand with no card dealt twice in the same deal', () => {
    const deck = Array.from({ length: 100 }, (_, i) => `card${i}`);
    const players = ['p1', 'p2', 'p3', 'p4'];
    const { hands } = dealHands(deck, players, 7, seeded(4));
    const allDealt = Object.values(hands).flat();
    expect(allDealt).toHaveLength(28);
    expect(new Set(allDealt).size).toBe(28); // no duplicates across the whole deal
    for (const uid of players) expect(hands[uid]).toHaveLength(7);
  });
});

describe('nextCzar', () => {
  it('rotates through the fixed order, wrapping around', () => {
    const order = ['a', 'b', 'c'];
    expect(nextCzar(order, 'a')).toBe('b');
    expect(nextCzar(order, 'c')).toBe('a');
  });
});

describe('anonymizeSubmissions', () => {
  it('preserves every submission while decoupling card from uid order (shuffled)', () => {
    const submissions = { p1: 'card-a', p2: 'card-b', p3: 'card-c' };
    const { order, cards } = anonymizeSubmissions(submissions, seeded(5));
    expect(order.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(cards.sort()).toEqual(['card-a', 'card-b', 'card-c']);
    // order[i] and cards[i] must still correctly correspond to each other
    order.forEach((uid, i) => expect(submissions[uid as keyof typeof submissions]).toBe(cards[i]));
  });
});
