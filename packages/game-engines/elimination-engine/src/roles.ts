import type { RoleDef } from './types';

export type MafiaRoleOptions = { evilCount: number; hasDetective: boolean; hasDoctor: boolean; hasVigilante: boolean };

/** The host's recommended starting point, scaled to the room; a good default and the pre-fill for the customization panel. */
export function recommendedMafiaOptions(playerCount: number): MafiaRoleOptions {
  return {
    evilCount: Math.max(1, Math.floor(playerCount / 4)),
    hasDetective: playerCount >= 5,
    hasDoctor: playerCount >= 6,
    hasVigilante: playerCount >= 8,
  };
}

/** Turns the host's chosen composition into role counts, villagers filling whatever's left. Validates it's actually playable. */
export function buildMafiaRoles(playerCount: number, opts: MafiaRoleOptions): RoleDef[] {
  if (playerCount < 4) throw new Error('Mafia needs at least 4 players');
  if (opts.evilCount < 1) throw new Error('Need at least 1 mafia');
  const namedCount = opts.evilCount + (opts.hasDetective ? 1 : 0) + (opts.hasDoctor ? 1 : 0) + (opts.hasVigilante ? 1 : 0);
  if (namedCount >= playerCount) throw new Error('Too many special roles for this many players');
  if (opts.evilCount * 2 >= playerCount) throw new Error('Mafia can\'t start equal to or larger than the rest of the town');
  const defs: RoleDef[] = [{ id: 'evil', team: 'evil', count: opts.evilCount }];
  if (opts.hasDetective) defs.push({ id: 'detective', team: 'town', count: 1 });
  if (opts.hasDoctor) defs.push({ id: 'doctor', team: 'town', count: 1 });
  if (opts.hasVigilante) defs.push({ id: 'vigilante', team: 'town', count: 1 });
  defs.push({ id: 'villager', team: 'town', count: playerCount - namedCount });
  return defs;
}

/** Mafia count scales ~1:4; a Detective joins at 5+, no Witch (that's Werewolf's role). */
export function defaultMafiaRoles(playerCount: number): RoleDef[] {
  return buildMafiaRoles(playerCount, recommendedMafiaOptions(playerCount));
}

/** Werewolf count scales ~1:4; Seer (detective) at 5+, Witch at 7+. */
export function defaultWerewolfRoles(playerCount: number): RoleDef[] {
  if (playerCount < 4) throw new Error('Werewolf needs at least 4 players');
  const evilCount = Math.max(1, Math.floor(playerCount / 4));
  const hasSeer = playerCount >= 5;
  const hasWitch = playerCount >= 7;
  const namedCount = evilCount + (hasSeer ? 1 : 0) + (hasWitch ? 1 : 0);
  const villagerCount = playerCount - namedCount;
  const defs: RoleDef[] = [{ id: 'evil', team: 'evil', count: evilCount }];
  if (hasSeer) defs.push({ id: 'detective', team: 'town', count: 1 });
  if (hasWitch) defs.push({ id: 'witch', team: 'town', count: 1 });
  defs.push({ id: 'villager', team: 'town', count: villagerCount });
  return defs;
}
