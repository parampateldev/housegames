import type { RoleDef, EnginePlayer, NightSubmission, NightResult, DayVoteResult, WinnerResult, Team } from './types';

/** Fisher-Yates. Accepts an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignRoles(playerIds: string[], roleDefs: RoleDef[], rng: () => number = Math.random): Record<string, string> {
  const totalRoles = roleDefs.reduce((sum, r) => sum + r.count, 0);
  if (totalRoles !== playerIds.length) {
    throw new Error(`Role count (${totalRoles}) must equal player count (${playerIds.length})`);
  }
  const pool: string[] = [];
  for (const def of roleDefs) for (let i = 0; i < def.count; i++) pool.push(def.id);
  const shuffledRoles = shuffle(pool, rng);
  const shuffledPlayers = shuffle(playerIds, rng);
  const assignment: Record<string, string> = {};
  shuffledPlayers.forEach((uid, i) => { assignment[uid] = shuffledRoles[i]; });
  return assignment;
}

/** Convenience lookup built from a room's roleConfig, e.g. teamsByRole(roleConfig)['Mafia'] === 'evil'. */
export function teamsByRole(roleDefs: RoleDef[]): Record<string, Team> {
  return Object.fromEntries(roleDefs.map((d) => [d.id, d.team]));
}

/**
 * Resolution order is the single highest-risk detail in this engine: a
 * 'protect' save must be checked before 'kill'/'solo-kill' targets are
 * applied, and 'poison' is a wholly independent, simultaneous kill that a
 * protect can never counter. Getting this order backwards is the classic
 * Mafia/Werewolf implementation bug.
 *
 * 'kill' votes are pooled per-team, not globally: two unrelated evil-team
 * "kill together" roles pool into one consensus target, but a hypothetical
 * town-team "kill together" role would never pool with the mafia's votes.
 */
export function resolveNight(submissions: NightSubmission[], teamByUid: Record<string, Team>): NightResult {
  const killVotesByTeam = new Map<Team, Record<string, string>>();
  const soloKillTargets: string[] = [];
  const poisonTargets: string[] = [];
  const protectedUids = new Set<string>();
  const investigations: NightResult['investigations'] = [];

  for (const s of submissions) {
    if (s.behavior === 'kill') {
      const byUid = killVotesByTeam.get(s.team) ?? {};
      byUid[s.uid] = s.targetUid;
      killVotesByTeam.set(s.team, byUid);
    } else if (s.behavior === 'solo-kill') {
      soloKillTargets.push(s.targetUid);
    } else if (s.behavior === 'poison') {
      poisonTargets.push(s.targetUid);
    } else if (s.behavior === 'protect') {
      protectedUids.add(s.targetUid);
    } else if (s.behavior === 'investigate') {
      investigations.push({ investigatorUid: s.uid, targetUid: s.targetUid, isEvil: teamByUid[s.targetUid] === 'evil' });
    }
  }

  const killedUids: string[] = [];
  for (const votes of killVotesByTeam.values()) {
    const target = tallyDayVote(votes).eliminatedUid;
    if (target && !protectedUids.has(target)) killedUids.push(target);
  }
  for (const t of soloKillTargets) if (!protectedUids.has(t)) killedUids.push(t);
  for (const t of poisonTargets) killedUids.push(t);

  return { killedUids: [...new Set(killedUids)], investigations };
}

/** weightByUid lets a role like Mayor ('extra-vote') count for two votes instead of one; omit it for an unweighted tally (e.g. the mafia's own pack-kill consensus). */
export function tallyDayVote(votes: Record<string, string>, weightByUid?: Record<string, number>): DayVoteResult {
  const counts = new Map<string, number>();
  for (const [voter, target] of Object.entries(votes)) {
    const weight = weightByUid?.[voter] ?? 1;
    counts.set(target, (counts.get(target) ?? 0) + weight);
  }
  if (counts.size === 0) return { eliminatedUid: null, tie: false };

  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([uid]) => uid);
  if (top.length > 1) return { eliminatedUid: null, tie: true };
  return { eliminatedUid: top[0], tie: false };
}

export function checkWinner(players: EnginePlayer[]): WinnerResult {
  const alive = players.filter((p) => p.alive);
  const aliveEvil = alive.filter((p) => p.team === 'evil').length;
  const aliveTown = alive.length - aliveEvil;
  if (aliveEvil === 0) return 'town';
  if (aliveEvil >= aliveTown) return 'evil';
  return null;
}
