import { tallyDayVote, type RoleDef, type RoleId } from '@engines/elimination/index';

export type MafiaPhase = 'lobby' | 'night' | 'day' | 'vote' | 'gameOver';
export type MafiaPlayer = { id: string; name: string; alive: boolean };
export type MafiaSettings = {
  roleConfig: RoleDef[];
  round: number;
  lastDeaths: string[];
  winner: 'town' | 'evil' | null;
};

/** What a player's own secret holds, role stays here for the whole game;
 *  nightAction/nightResult get overwritten round to round. */
export type MafiaSecret = {
  role: RoleId;
  teammates?: string[]; // other evil players' names, only present for evil roles
  nightAction?: { round: number; targetUid?: string }; // kill vote (evil) / save (doctor) / check (detective) / shot (vigilante)
  nightResult?: { round: number; targetUid: string; isEvil: boolean };
  vigilanteShotUsed?: boolean; // vigilante's one bullet, for the whole game
};

export function mkPlayer(id: string, name: string): MafiaPlayer {
  return { id, name, alive: true };
}

/**
 * Assembles the engine's NightActions from each acting player's own
 * independently-submitted secret. The pack's kill target is resolved by
 * plurality among however many evil members have voted so far (reusing
 * tallyDayVote, it's the same "most votes wins, tie = no result" shape).
 */
export function buildNightActions(
  secrets: Record<string, MafiaSecret>,
  roles: Record<string, RoleId>,
  round: number,
) {
  const evilVotes: Record<string, string> = {};
  let doctorSaveUid: string | undefined;
  let detectiveCheckUid: string | undefined;
  let vigilanteTargetUid: string | undefined;

  for (const [uid, role] of Object.entries(roles)) {
    const action = secrets[uid]?.nightAction;
    if (action && action.round === round && action.targetUid) {
      if (role === 'evil') evilVotes[uid] = action.targetUid;
      else if (role === 'doctor') doctorSaveUid = action.targetUid;
      else if (role === 'detective') detectiveCheckUid = action.targetUid;
      else if (role === 'vigilante' && !secrets[uid]?.vigilanteShotUsed) vigilanteTargetUid = action.targetUid;
    }
  }

  const evilTargetUid = Object.keys(evilVotes).length ? tallyDayVote(evilVotes).eliminatedUid ?? undefined : undefined;

  return { evilTargetUid, doctorSaveUid, detectiveCheckUid, vigilanteTargetUid };
}

/**
 * True once every ALIVE mandatory acting role (evil, doctor, detective) has
 * submitted this round. The vigilante is excluded: their one shot for the
 * whole game is genuinely optional each night, so requiring a submission
 * would let one undecided vigilante stall the game, the host can always
 * resolve night manually once they judge it's time.
 */
export function allNightActionsIn(
  secrets: Record<string, MafiaSecret>,
  roles: Record<string, RoleId>,
  alivePlayerIds: string[],
  round: number,
): boolean {
  const requiredRoles: RoleId[] = ['evil', 'doctor', 'detective'];
  const actors = alivePlayerIds.filter((id) => requiredRoles.includes(roles[id]));
  return actors.every((id) => secrets[id]?.nightAction?.round === round && secrets[id]?.nightAction?.targetUid);
}
