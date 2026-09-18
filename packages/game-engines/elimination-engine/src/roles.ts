import type { RoleDef } from './types';

/** Mafia count scales ~1:4; a Detective joins at 5+, no Witch (that's Werewolf's role). */
export function defaultMafiaRoles(playerCount: number): RoleDef[] {
  if (playerCount < 4) throw new Error('Mafia needs at least 4 players');
  const evilCount = Math.max(1, Math.floor(playerCount / 4));
  const hasDetective = playerCount >= 5;
  const hasDoctor = playerCount >= 6;
  const namedCount = evilCount + (hasDetective ? 1 : 0) + (hasDoctor ? 1 : 0);
  const villagerCount = playerCount - namedCount;
  const defs: RoleDef[] = [{ id: 'evil', team: 'evil', count: evilCount }];
  if (hasDetective) defs.push({ id: 'detective', team: 'town', count: 1 });
  if (hasDoctor) defs.push({ id: 'doctor', team: 'town', count: 1 });
  defs.push({ id: 'villager', team: 'town', count: villagerCount });
  return defs;
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
