// Ported verbatim from the original empire repo's src/game.ts, same
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

/** Snapshot the host needs before calling capture(), so a mistaken capture can be undone exactly. */
export type CaptureRecord = { attackerId: string; targetId: string; targetMembersBefore: string[]; at: number };

export function recordCapture(attackerId: string, targetId: string, players: Record<string, Player>): CaptureRecord {
  return { attackerId, targetId, targetMembersBefore: [...(players[targetId]?.members || [])], at: Date.now() };
}

/** Reverses exactly one capture, using the pre-capture snapshot rather than re-deriving state, so it's correct even if the target had already absorbed members of its own. */
export function undoCapture(players: Record<string, Player>, record: CaptureRecord): Record<string, Player> {
  const next = structuredClone(players);
  const attacker = next[record.attackerId];
  const target = next[record.targetId];
  if (!attacker || !target) throw new Error('Cannot undo, a player is missing');
  // Firebase drops an empty array on write, so a target captured while
  // still independent reads back with targetMembersBefore undefined, not [].
  const membersBefore = record.targetMembersBefore || [];
  const reclaimed = new Set([record.targetId, ...membersBefore]);
  attacker.members = (attacker.members || []).filter((id) => !reclaimed.has(id));
  target.eliminated = false;
  target.leaderId = record.targetId;
  target.members = membersBefore;
  for (const id of membersBefore) {
    if (next[id]) { next[id].leaderId = record.targetId; next[id].eliminated = true; }
  }
  return next;
}

export function winner(players: Record<string, Player>): Player | null {
  const alive = Object.values(players).filter((p) => !p.eliminated);
  return alive.length === 1 && Object.keys(players).length > 1 ? alive[0] : null;
}

export function remainingMs(revealEndsAt: number, now = Date.now()): number {
  return Math.max(0, revealEndsAt - now);
}
