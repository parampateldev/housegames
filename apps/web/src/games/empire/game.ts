// Ported verbatim from the original empire repo's src/game.ts — same
// capture/winner mechanics, unchanged, because this logic was already
// correct and tested there.
export type Phase = 'lobby' | 'reveal' | 'playing' | 'finished';
export type Player = { id: string; name: string; submitted: boolean; leaderId: string; members: string[]; eliminated: boolean };

export function mk(id: string, name: string): Player {
  return { id, name, submitted: false, leaderId: id, members: [], eliminated: false };
}

export function capture(players: Record<string, Player>, attackerId: string, targetId: string): Record<string, Player> {
  if (attackerId === targetId) throw new Error('Choose another empire');
  const next = structuredClone(players);
  const attacker = next[attackerId];
  const target = next[targetId];
  if (!attacker || !target || attacker.eliminated || target.eliminated) throw new Error('Invalid capture');
  const claimed = [targetId, ...(target.members || [])];
  attacker.members = [...new Set([...(attacker.members || []), ...claimed])];
  target.eliminated = true;
  target.leaderId = attackerId;
  for (const id of target.members || []) {
    if (next[id]) { next[id].leaderId = attackerId; next[id].eliminated = true; }
  }
  target.members = [];
  return next;
}

export function winner(players: Record<string, Player>): Player | null {
  const alive = Object.values(players).filter((p) => !p.eliminated);
  return alive.length === 1 && Object.keys(players).length > 1 ? alive[0] : null;
}

export function remainingMs(revealEndsAt: number, now = Date.now()): number {
  return Math.max(0, revealEndsAt - now);
}
