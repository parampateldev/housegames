import { type RoleDef, type RoleBehavior, type NightSubmission, type Team } from '@engines/elimination/index';

export type MafiaPhase = 'lobby' | 'night' | 'day' | 'vote' | 'gameOver';
export type MafiaPlayer = { id: string; name: string; alive: boolean };
export type MafiaSettings = {
  roleConfig: RoleDef[];
  round: number;
  lastDeaths: string[];
  winner: 'town' | 'evil' | null;
};

const MANDATORY_BEHAVIORS: RoleBehavior[] = ['kill', 'investigate', 'protect'];
const ONE_SHOT_BEHAVIORS: RoleBehavior[] = ['solo-kill', 'poison'];

/** What a player's own secret holds. Role/team/behavior stay fixed for the
 *  whole game, whatever roster the host built in the lobby; nightAction and
 *  nightResult get overwritten round to round. */
export type MafiaSecret = {
  role: string; // the host-typed role name, a preset or fully custom
  team: Team;
  behavior: RoleBehavior; // every Mafia role has exactly one power (unlike Werewolf's Witch)
  teammates?: string[]; // other same-team players' names, only shown to the evil team
  nightAction?: { round: number; targetUid?: string };
  nightResult?: { round: number; targetUid: string; isEvil: boolean };
  usedOnce?: boolean; // a one-shot behavior (solo-kill), once it's been used
};

export function mkPlayer(id: string, name: string): MafiaPlayer {
  return { id, name, alive: true };
}

/** Assembles the shared engine's night submissions straight from each acting player's own secret (which already carries their team and behavior). */
export function buildNightActions(secrets: Record<string, MafiaSecret>, round: number): NightSubmission[] {
  const submissions: NightSubmission[] = [];
  for (const [uid, secret] of Object.entries(secrets)) {
    if (!secret || secret.behavior === 'none' || secret.behavior === 'extra-vote') continue;
    if (ONE_SHOT_BEHAVIORS.includes(secret.behavior) && secret.usedOnce) continue;
    const action = secret.nightAction;
    if (action && action.round === round && action.targetUid) {
      submissions.push({ uid, team: secret.team, behavior: secret.behavior, targetUid: action.targetUid });
    }
  }
  return submissions;
}

/**
 * True once every ALIVE mandatory-behavior role (kill, investigate, protect)
 * has submitted this round. One-shot (solo-kill) and no-power roles are
 * never required, the host can always resolve night manually once they
 * judge it's time.
 */
export function allNightActionsIn(secrets: Record<string, MafiaSecret>, alivePlayerIds: string[], round: number): boolean {
  const actors = alivePlayerIds.filter((id) => secrets[id] && MANDATORY_BEHAVIORS.includes(secrets[id].behavior));
  return actors.every((id) => secrets[id]?.nightAction?.round === round && secrets[id]?.nightAction?.targetUid);
}

/** Weight overrides for the day vote: an 'extra-vote' role's (e.g. Mayor's) ballot counts twice. */
export function dayVoteWeights(secrets: Record<string, MafiaSecret>): Record<string, number> {
  return Object.fromEntries(Object.entries(secrets).filter(([, s]) => s?.behavior === 'extra-vote').map(([uid]) => [uid, 2]));
}
