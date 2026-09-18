export type Phase = 'lobby' | 'guessing' | 'roundEnd';
export type Player = { id: string; name: string; score?: number };

export function nextGuesser(players: Player[], currentGuesserId: string): string {
  const idx = players.findIndex((p) => p.id === currentGuesserId);
  return players[(idx + 1) % players.length]?.id ?? players[0]?.id ?? '';
}

/** The uids who SHOULD see the current word, everyone except the active guesser. */
export function audienceFor(players: Player[], guesserId: string): string[] {
  return players.filter((p) => p.id !== guesserId).map((p) => p.id);
}
