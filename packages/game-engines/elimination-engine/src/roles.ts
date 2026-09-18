import type { RoleDef, RoleBehavior, Team } from './types';

export type RolePreset = { id: string; team: Team; behaviors: RoleBehavior[]; description: string };

/** The host's starting palette in Mafia's role editor. They can remove, recolor, recount, or ignore any of these entirely, and add their own. */
export const MAFIA_ROLE_PRESETS: RolePreset[] = [
  { id: 'Mafia', team: 'evil', behaviors: ['kill'], description: 'Chooses a target with the rest of the mafia, every night.' },
  { id: 'Police', team: 'town', behaviors: ['investigate'], description: 'Investigates one player a night to learn if they are mafia.' },
  { id: 'Doctor', team: 'town', behaviors: ['protect'], description: 'Protects one player a night from elimination.' },
  { id: 'Vigilante', team: 'town', behaviors: ['solo-kill'], description: 'Has one bullet for the whole game, usable any night.' },
  { id: 'Mayor', team: 'town', behaviors: ['extra-vote'], description: 'No night power, but their day vote counts twice.' },
  { id: 'Townie', team: 'town', behaviors: ['none'], description: 'No powers, just a vote.' },
];

/** Plain-English description of what a behavior does, for the "create a role" form. */
export const ROLE_BEHAVIOR_LABEL: Record<RoleBehavior, string> = {
  kill: 'Kills together with its team, every night',
  'solo-kill': 'One-shot solo kill for the whole game, blockable by a protector',
  poison: 'One-shot solo kill for the whole game, cannot be blocked',
  investigate: "Learns one target's team each night",
  protect: 'Shields one target from elimination each night',
  'extra-vote': 'No night power, day vote counts twice',
  none: 'No powers',
};

/** A sensible starting roster for the host's role editor, scaled to the room. Townie fills whatever's left. */
export function recommendedMafiaRoles(playerCount: number): RoleDef[] {
  const evilCount = Math.max(1, Math.floor(playerCount / 4));
  const hasPolice = playerCount >= 5;
  const hasDoctor = playerCount >= 6;
  const hasVigilante = playerCount >= 8;
  const named = evilCount + (hasPolice ? 1 : 0) + (hasDoctor ? 1 : 0) + (hasVigilante ? 1 : 0);
  const roles: RoleDef[] = [{ id: 'Mafia', team: 'evil', behaviors: ['kill'], count: evilCount }];
  if (hasPolice) roles.push({ id: 'Police', team: 'town', behaviors: ['investigate'], count: 1 });
  if (hasDoctor) roles.push({ id: 'Doctor', team: 'town', behaviors: ['protect'], count: 1 });
  if (hasVigilante) roles.push({ id: 'Vigilante', team: 'town', behaviors: ['solo-kill'], count: 1 });
  roles.push({ id: 'Townie', team: 'town', behaviors: ['none'], count: Math.max(playerCount - named, 0) });
  return roles;
}

/**
 * Validates a host-built roster before a game can start: every role needs a
 * unique, non-blank name, the counts must land on the exact player count
 * (no implicit villager fill-in once the host is editing directly), there
 * must be at least one mafia-team role, and mafia can never start equal to
 * or larger than the rest of the town. Returns an error message, or null
 * once the roster is playable.
 */
export function validateRoleComposition(playerCount: number, roles: RoleDef[]): string | null {
  const active = roles.filter((r) => r.count > 0);
  if (active.length === 0) return 'Add at least one role';
  if (active.some((r) => !r.id.trim())) return 'Every role needs a name';
  const ids = active.map((r) => r.id.trim().toLowerCase());
  if (new Set(ids).size !== ids.length) return 'Role names must be unique';
  const total = active.reduce((sum, r) => sum + r.count, 0);
  if (total !== playerCount) return `Roles must add up to exactly ${playerCount} players (currently ${total})`;
  const evilCount = active.filter((r) => r.team === 'evil').reduce((sum, r) => sum + r.count, 0);
  if (evilCount < 1) return 'Need at least one mafia-team role';
  if (evilCount * 2 >= playerCount) return 'Mafia can\'t start equal to or larger than the rest of the town';
  return null;
}

/** Werewolf keeps its own fixed roster (Seer/Doctor/Witch), it doesn't expose the free-form role editor. */
export function defaultWerewolfRoles(playerCount: number): RoleDef[] {
  if (playerCount < 4) throw new Error('Werewolf needs at least 4 players');
  const evilCount = Math.max(1, Math.floor(playerCount / 4));
  const hasSeer = playerCount >= 5;
  const hasWitch = playerCount >= 7;
  const namedCount = evilCount + (hasSeer ? 1 : 0) + (hasWitch ? 1 : 0);
  const villagerCount = playerCount - namedCount;
  const defs: RoleDef[] = [{ id: 'evil', team: 'evil', behaviors: ['kill'], count: evilCount }];
  if (hasSeer) defs.push({ id: 'detective', team: 'town', behaviors: ['investigate'], count: 1 });
  if (hasWitch) defs.push({ id: 'witch', team: 'town', behaviors: ['protect', 'poison'], count: 1 });
  defs.push({ id: 'villager', team: 'town', behaviors: ['none'], count: villagerCount });
  return defs;
}
