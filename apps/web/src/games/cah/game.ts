// Pure logic for Cards Against Humanity, deck shuffling/dealing without
// repeats, czar rotation, and anonymize-then-reveal for judging.

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Draws `n` cards from `deck` starting at `drawIndex`, reshuffling a fresh full deck in if it runs out, so a card is never dealt twice within one continuous draw sequence, and the game never stalls on a long session. */
export function drawCards<T>(deck: T[], drawIndex: number, n: number, fullDeck: T[], rng: () => number = Math.random): { cards: T[]; nextDeck: T[]; nextDrawIndex: number } {
  let workingDeck = deck;
  let idx = drawIndex;
  if (idx + n > workingDeck.length) {
    workingDeck = shuffle(fullDeck, rng);
    idx = 0;
  }
  return { cards: workingDeck.slice(idx, idx + n), nextDeck: workingDeck, nextDrawIndex: idx + n };
}

export function dealHands(whiteDeck: string[], playerIds: string[], handSize = 7, rng: () => number = Math.random): { hands: Record<string, string[]>; nextDeck: string[]; nextDrawIndex: number } {
  let deck = whiteDeck;
  let idx = 0;
  const hands: Record<string, string[]> = {};
  for (const uid of playerIds) {
    const { cards, nextDeck, nextDrawIndex } = drawCards(deck, idx, handSize, whiteDeck, rng);
    hands[uid] = cards;
    deck = nextDeck;
    idx = nextDrawIndex;
  }
  return { hands, nextDeck: deck, nextDrawIndex: idx };
}

export function nextCzar(order: string[], currentCzarId: string): string {
  const idx = order.indexOf(currentCzarId);
  return order[(idx + 1) % order.length];
}

export type AnonymizedSubmissions = { order: string[]; cards: string[] };

/** Shuffles {uid: card} into a parallel (order[], cards[]) pair so the czar never sees who played what, order[] is kept host-side only, revealed after judging. */
export function anonymizeSubmissions(submissions: Record<string, string>, rng: () => number = Math.random): AnonymizedSubmissions {
  const entries = shuffle(Object.entries(submissions), rng);
  return { order: entries.map(([uid]) => uid), cards: entries.map(([, card]) => card) };
}
