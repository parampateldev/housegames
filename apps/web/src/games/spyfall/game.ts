import type { LocationDef } from './locations';

export type Phase = 'lobby' | 'roles' | 'discussion' | 'vote' | 'results';
export type Settings = { timerSeconds: number };
export type Player = { id: string; name: string };

export type DealResult = {
  location: string;
  spyId: string;
  roles: Record<string, string>; // uid -> role, excludes the spy
};

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealRound(playerIds: string[], locations: LocationDef[], rng: () => number = Math.random): DealResult {
  if (playerIds.length < 3) throw new Error('Spyfall needs at least 3 players');
  const location = locations[Math.floor(rng() * locations.length)];
  const spyId = playerIds[Math.floor(rng() * playerIds.length)];
  const others = playerIds.filter((id) => id !== spyId);
  const roleDeck = shuffle(location.roles, rng);
  const roles: Record<string, string> = {};
  others.forEach((uid, i) => { roles[uid] = roleDeck[i % roleDeck.length]; });
  return { location: location.name, spyId, roles };
}

export function tallyVote(votes: Record<string, string>): { accusedId: string | null; tie: boolean } {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  if (counts.size === 0) return { accusedId: null, tie: false };
  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([uid]) => uid);
  return top.length > 1 ? { accusedId: null, tie: true } : { accusedId: top[0], tie: false };
}

/** Spy wins by naming the exact location, or if the vote fails to catch them. */
export function spyGuessCorrect(guess: string, actualLocation: string): boolean {
  return guess.trim().toLowerCase() === actualLocation.trim().toLowerCase();
}
