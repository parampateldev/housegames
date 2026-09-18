import { type RoleDef, type NightSubmission, type Team } from '@engines/elimination/index';

export type WerewolfPhase = 'lobby' | 'night' | 'day' | 'vote' | 'gameOver';
export type WerewolfPlayer = { id: string; name: string; alive: boolean };
export type WerewolfSettings = {
  roleConfig: RoleDef[];
  round: number;
  lastDeaths: string[];
  winner: 'town' | 'evil' | null;
};

/** Werewolf keeps its own small, fixed roster, it doesn't expose Mafia's free-form role editor. */
export type WerewolfRoleId = 'evil' | 'doctor' | 'detective' | 'witch' | 'villager';
export const WEREWOLF_TEAM_OF: Record<WerewolfRoleId, Team> = {
  evil: 'evil', doctor: 'town', detective: 'town', witch: 'town', villager: 'town',
};

/** What a player's own secret holds, role stays here for the whole game;
 *  nightAction/nightResult get overwritten round to round. */
export type WerewolfSecret = {
  role: WerewolfRoleId;
  teammates?: string[]; // other evil players' names, only present for evil roles
  nightAction?: { round: number; targetUid?: string }; // kill vote (evil) / save (doctor+witch) / check (detective)
  nightPoison?: { round: number; targetUid: string }; // witch's separate, independent poison action
  nightResult?: { round: number; targetUid: string; isEvil: boolean };
  witchSaveUsed?: boolean;
  witchPoisonUsed?: boolean;
};

export function mkPlayer(id: string, name: string): WerewolfPlayer {
  return { id, name, alive: true };
}

/**
 * Assembles the shared engine's night submissions from each acting player's
 * own independently-submitted secret. The witch's save and poison are two
 * SEPARATE submissions from the same uid, since she holds two independent
 * behaviors (that's exactly what NightSubmission's per-behavior shape is for).
 */
export function buildNightActions(
  secrets: Record<string, WerewolfSecret>,
  roles: Record<string, WerewolfRoleId>,
  round: number,
): NightSubmission[] {
  const submissions: NightSubmission[] = [];
  for (const [uid, role] of Object.entries(roles)) {
    const action = secrets[uid]?.nightAction;
    if (action && action.round === round && action.targetUid) {
      if (role === 'evil') submissions.push({ uid, team: 'evil', behavior: 'kill', targetUid: action.targetUid });
      else if (role === 'doctor' || role === 'witch') submissions.push({ uid, team: 'town', behavior: 'protect', targetUid: action.targetUid });
      else if (role === 'detective') submissions.push({ uid, team: 'town', behavior: 'investigate', targetUid: action.targetUid });
    }
    // Witch poison is a SEPARATE, independent action from her save.
    if (role === 'witch') {
      const poison = secrets[uid]?.nightPoison;
      if (poison && poison.round === round) submissions.push({ uid, team: 'town', behavior: 'poison', targetUid: poison.targetUid });
    }
  }
  return submissions;
}

/**
 * True once every ALIVE mandatory acting role (evil, doctor, detective) has
 * submitted this round. The witch is excluded: both her save and poison are
 * genuinely optional each night, so requiring a submission from her would
 * let one disconnected/undecided witch stall the whole game, the host can
 * always resolve night manually once they judge it's time.
 */
export function allNightActionsIn(
  secrets: Record<string, WerewolfSecret>,
  roles: Record<string, WerewolfRoleId>,
  alivePlayerIds: string[],
  round: number,
): boolean {
  const requiredRoles: WerewolfRoleId[] = ['evil', 'doctor', 'detective'];
  const actors = alivePlayerIds.filter((id) => requiredRoles.includes(roles[id]));
  return actors.every((id) => secrets[id]?.nightAction?.round === round && secrets[id]?.nightAction?.targetUid);
}
