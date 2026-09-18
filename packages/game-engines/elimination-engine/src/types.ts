export type Team = 'town' | 'evil';

/**
 * The fixed set of mechanical night powers a role can be built from. A host
 * (or a game's own fixed roster, like Werewolf's) composes named roles out
 * of these; the engine only ever reasons about behaviors, never role names.
 */
export type RoleBehavior =
  | 'kill' // pools with every other 'kill' actor on the SAME team into one consensus target, every night
  | 'solo-kill' // acts alone, one bullet for the whole game, blockable by 'protect'
  | 'poison' // acts alone, one dose for the whole game, NOT blockable by 'protect'
  | 'investigate' // learns the target's team
  | 'protect' // shields its target from every kill/solo-kill this round (not poison)
  | 'extra-vote' // no night power; this role's day vote counts twice
  | 'none'; // no power at all

/** A named role a host has configured, e.g. { id: 'Mafia', team: 'evil', behaviors: ['kill'], count: 3 }. */
export type RoleDef = { id: string; team: Team; behaviors: RoleBehavior[]; count: number };

export type EnginePlayer = { id: string; role: string; team: Team; alive: boolean };

/** One acting player's submitted night choice, one entry per behavior they used this round. */
export type NightSubmission = { uid: string; team: Team; behavior: RoleBehavior; targetUid: string };

export type NightResult = {
  killedUids: string[]; // after every protect/poison interaction is resolved
  investigations: { investigatorUid: string; targetUid: string; isEvil: boolean }[];
};

export type DayVoteResult = { eliminatedUid: string | null; tie: boolean };

export type WinnerResult = Team | null;
