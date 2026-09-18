// Pure logic for Secret Hitler — role assignment, policy deck, vote tally,
// and win checks. No Firebase here; see firebase.ts for the host-brokered
// data layer that calls into this.

export type Role = 'liberal' | 'fascist' | 'hitler';
export type Policy = 'liberal' | 'fascist';

export type RoleAssignment = {
  roles: Record<string, Role>;
  /** For each fascist uid (Hitler included only when hitlerSeesTeam), the OTHER fascist-team uids they see. */
  teamSeenBy: Record<string, string[]>;
  hitlerSeesTeam: boolean;
};

const ROLE_TABLE: Record<number, { fascists: number; hitlerSeesTeam: boolean }> = {
  5: { fascists: 1, hitlerSeesTeam: true },
  6: { fascists: 1, hitlerSeesTeam: true },
  7: { fascists: 2, hitlerSeesTeam: false },
  8: { fascists: 2, hitlerSeesTeam: false },
  9: { fascists: 3, hitlerSeesTeam: false },
  10: { fascists: 3, hitlerSeesTeam: false },
};

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignSecretHitlerRoles(playerIds: string[], rng: () => number = Math.random): RoleAssignment {
  const n = playerIds.length;
  const table = ROLE_TABLE[n];
  if (!table) throw new Error('Secret Hitler needs 5–10 players');

  const shuffled = shuffle(playerIds, rng);
  const hitlerUid = shuffled[0];
  const fascistUids = shuffled.slice(1, 1 + table.fascists);
  const liberalUids = shuffled.slice(1 + table.fascists);

  const roles: Record<string, Role> = { [hitlerUid]: 'hitler' };
  for (const uid of fascistUids) roles[uid] = 'fascist';
  for (const uid of liberalUids) roles[uid] = 'liberal';

  const teamSeenBy: Record<string, string[]> = {};
  for (const uid of fascistUids) {
    teamSeenBy[uid] = [...fascistUids.filter((f) => f !== uid), hitlerUid];
  }
  if (table.hitlerSeesTeam) {
    teamSeenBy[hitlerUid] = [...fascistUids];
  }

  return { roles, teamSeenBy, hitlerSeesTeam: table.hitlerSeesTeam };
}

export function buildPolicyDeck(rng: () => number = Math.random): Policy[] {
  const deck: Policy[] = [
    ...Array(6).fill('liberal'),
    ...Array(11).fill('fascist'),
  ];
  return shuffle(deck, rng);
}

/** Draws the next `n` cards starting at drawIndex, reshuffling the deck back in if it runs out. */
export function drawCards(deck: Policy[], drawIndex: number, n: number, rng: () => number = Math.random): { cards: Policy[]; nextDeck: Policy[]; nextDrawIndex: number } {
  let workingDeck = deck;
  let idx = drawIndex;
  if (idx + n > workingDeck.length) {
    workingDeck = buildPolicyDeck(rng);
    idx = 0;
  }
  return { cards: workingDeck.slice(idx, idx + n), nextDeck: workingDeck, nextDrawIndex: idx + n };
}

export function tallySHVote(votes: Record<string, 'ja' | 'nein'>): { passed: boolean } {
  const cast = Object.values(votes);
  const ja = cast.filter((v) => v === 'ja').length;
  const nein = cast.length - ja;
  return { passed: ja > nein };
}

export type SHWinCheck = { liberalPolicies: number; fascistPolicies: number; chancellorId: string | null; roles: Record<string, Role> };

export function checkSHWinner({ liberalPolicies, fascistPolicies, chancellorId, roles }: SHWinCheck): 'liberal' | 'fascist' | null {
  if (liberalPolicies >= 5) return 'liberal';
  if (fascistPolicies >= 6) return 'fascist';
  if (fascistPolicies >= 3 && chancellorId && roles[chancellorId] === 'hitler') return 'fascist';
  return null;
}

export function nextPresident(order: string[], currentPresidentId: string): string {
  const idx = order.indexOf(currentPresidentId);
  return order[(idx + 1) % order.length];
}
