import type { RoleDef, RoleId, EnginePlayer, NightActions, NightResult, DayVoteResult, WinnerResult, Team } from './types';

/** Fisher-Yates. Accepts an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignRoles(playerIds: string[], roleDefs: RoleDef[], rng: () => number = Math.random): Record<string, RoleId> {
  const totalRoles = roleDefs.reduce((sum, r) => sum + r.count, 0);
  if (totalRoles !== playerIds.length) {
    throw new Error(`Role count (${totalRoles}) must equal player count (${playerIds.length})`);
  }
  const pool: RoleId[] = [];
  for (const def of roleDefs) for (let i = 0; i < def.count; i++) pool.push(def.id);
  const shuffledRoles = shuffle(pool, rng);
  const shuffledPlayers = shuffle(playerIds, rng);
  const assignment: Record<string, RoleId> = {};
  shuffledPlayers.forEach((uid, i) => { assignment[uid] = shuffledRoles[i]; });
  return assignment;
}

/**
 * Resolution order is the single highest-risk detail in this engine:
 * a doctor/witch SAVE must be checked before the pack's kill is applied,
 * and the witch's poison is a wholly independent, simultaneous kill that
 * a save can never counter. Getting this order backwards is the classic
 * Mafia/Werewolf implementation bug.
 */
export function resolveNight(actions: NightActions, roles: Record<string, RoleId>): NightResult {
  const killedUids: string[] = [];

  if (actions.evilTargetUid && actions.evilTargetUid !== actions.doctorSaveUid) {
    killedUids.push(actions.evilTargetUid);
  }
  if (actions.vigilanteTargetUid && actions.vigilanteTargetUid !== actions.doctorSaveUid) {
    killedUids.push(actions.vigilanteTargetUid);
  }
  if (actions.witchPoisonUid) {
    killedUids.push(actions.witchPoisonUid);
  }

  let investigation: NightResult['investigation'];
  if (actions.detectiveCheckUid) {
    const targetRole = roles[actions.detectiveCheckUid];
    investigation = { targetUid: actions.detectiveCheckUid, isEvil: targetRole === 'evil' };
  }

  return { killedUids: [...new Set(killedUids)], investigation };
}

export function tallyDayVote(votes: Record<string, string>): DayVoteResult {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  if (counts.size === 0) return { eliminatedUid: null, tie: false };

  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([uid]) => uid);
  if (top.length > 1) return { eliminatedUid: null, tie: true };
  return { eliminatedUid: top[0], tie: false };
}

export function checkWinner(players: EnginePlayer[]): WinnerResult {
  const alive = players.filter((p) => p.alive);
  const aliveEvil = alive.filter((p) => p.role === 'evil').length;
  const aliveTown = alive.length - aliveEvil;
  if (aliveEvil === 0) return 'town';
  if (aliveEvil >= aliveTown) return 'evil';
  return null;
}

export function roleTeam(role: RoleId): Team {
  return role === 'evil' ? 'evil' : 'town';
}
