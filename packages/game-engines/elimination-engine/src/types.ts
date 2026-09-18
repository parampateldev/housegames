export type Team = 'town' | 'evil';

export type RoleId = 'villager' | 'evil' | 'doctor' | 'detective' | 'witch';

export type RoleDef = { id: RoleId; team: Team; count: number };

export type EnginePlayer = {
  id: string;
  role: RoleId;
  alive: boolean;
};

/** One night's worth of submitted actions, keyed by acting player's uid. */
export type NightActions = {
  evilTargetUid?: string; // the mafia/werewolf pack's chosen kill target (consensus, decided upstream)
  doctorSaveUid?: string; // doctor/witch-save target
  detectiveCheckUid?: string; // detective/seer target
  witchPoisonUid?: string; // werewolf-only: witch's one-time poison, independent of the pack kill
};

export type NightResult = {
  killedUids: string[]; // after doctor-save and witch-poison are both applied
  investigation?: { targetUid: string; isEvil: boolean };
};

export type DayVoteResult = {
  eliminatedUid: string | null;
  tie: boolean;
};

export type WinnerResult = Team | null;
