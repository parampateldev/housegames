import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, getAllSecretsOnce, watchMySecret as watchMySecretGeneric, watchAllSecrets,
  db, type BaseRoom,
} from '@fb/index';
import {
  assignRoles as engineAssignRoles, resolveNight as engineResolveNight, tallyDayVote, checkWinner,
  recommendedMafiaRoles, validateRoleComposition,
  type RoleDef, type EnginePlayer, type Team,
} from '@engines/elimination/index';
import { get, ref, set, update, remove, onValue } from 'firebase/database';
import {
  buildNightActions, allNightActionsIn, dayVoteWeights,
  type MafiaPlayer, type MafiaSettings, type MafiaSecret,
} from './game';

const NS = 'mafia';

export type MafiaRoom = BaseRoom<MafiaSettings, MafiaPlayer>;

export { recommendedMafiaRoles, validateRoleComposition };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createMafiaRoom(code: string, hostId: string, hostPlayer: MafiaPlayer) {
  const settings: MafiaSettings = { roleConfig: [], round: 0, lastDeaths: [], winner: null };
  await createRoom(NS, code, hostId, hostPlayer, settings);
}

export async function joinMafiaRoom(code: string, player: MafiaPlayer) {
  await joinRoom(NS, code, player);
}

export function watchMafiaRoom(code: string, cb: (room: MafiaRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<MafiaRoom>(NS, code, cb, onError);
}

export function watchMySecret(code: string, uid: string, cb: (s: MafiaSecret | null) => void) {
  return watchMySecretGeneric<MafiaSecret>(NS, code, uid, cb);
}

/** Host-only: reads every local (no-device) player's role/night-action state so the host can act for them. */
export function watchLocalSecrets(code: string, localUids: string[], cb: (secrets: Record<string, MafiaSecret>) => void) {
  return watchAllSecrets<MafiaSecret>(NS, code, localUids, cb);
}

async function getRoom(code: string): Promise<MafiaRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as MafiaRoom | null;
}

/** Host-only: assigns roles once from the host's own role roster (or the recommended default if they never opened the editor), writes each player's own secret, starts round 1. */
export async function assignRolesAndStartNight(code: string, hostId: string, roleConfigIn?: RoleDef[]) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const players = Object.values(room.players ?? {});
  if (players.length < 4) throw new Error('Need at least 4 players');
  const roleConfig = roleConfigIn ?? recommendedMafiaRoles(players.length);
  const validationError = validateRoleComposition(players.length, roleConfig);
  if (validationError) throw new Error(validationError);

  const roles = engineAssignRoles(players.map((p) => p.id), roleConfig);
  const defByRole = Object.fromEntries(roleConfig.map((r) => [r.id, r]));
  const uidsByTeam: Record<Team, string[]> = { evil: [], town: [] };
  for (const p of players) {
    const def = defByRole[roles[p.id]];
    if (def) uidsByTeam[def.team].push(p.id);
  }

  await Promise.all(players.map((p) => {
    const roleId = roles[p.id];
    const def = defByRole[roleId];
    const behavior = def.behaviors[0] ?? 'none';
    const secret: MafiaSecret = { role: roleId, team: def.team, behavior };
    if (def.team === 'evil') {
      secret.teammates = uidsByTeam.evil.filter((uid) => uid !== p.id).map((uid) => players.find((pl) => pl.id === uid)!.name);
    }
    return setSecret<MafiaSecret>(NS, code, p.id, secret);
  }));

  await saveSettings<MafiaSettings>(NS, code, hostId, { roleConfig, round: 1, lastDeaths: [], winner: null });
  await setPhase(NS, code, hostId, 'night');
}

/** Merge-updates the acting player's OWN secret with their pick, keeping role/team/behavior intact. Pass oneShot for a solo-kill role using their one bullet. */
export async function submitNightAction(code: string, uid: string, round: number, targetUid: string, oneShot?: boolean) {
  const patch: Partial<MafiaSecret> = { nightAction: { round, targetUid } };
  if (oneShot) patch.usedOnce = true;
  await update(ref(requireDb(), `${NS}/secrets/${code}/${uid}`), patch);
}

export async function nightActionsReady(code: string, alivePlayerIds: string[]): Promise<boolean> {
  const room = await getRoom(code);
  if (!room) return false;
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  return allNightActionsIn(secrets, alivePlayerIds, room.settings.round);
}

/** Host-only: resolves the night (protect-before-kill etc handled by the shared engine), applies deaths, advances to day. */
export async function resolveNightPhase(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the night');
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  const teamByUid = Object.fromEntries(players.map((p) => [p.id, secrets[p.id]?.team ?? 'town'])) as Record<string, Team>;

  const submissions = buildNightActions(secrets, room.settings.round);
  const result = engineResolveNight(submissions, teamByUid);

  await Promise.all(result.killedUids.map((uid) => updatePlayer<MafiaPlayer>(NS, code, uid, { alive: false })));
  await Promise.all(result.investigations.map((inv) => update(ref(requireDb(), `${NS}/secrets/${code}/${inv.investigatorUid}`), {
    nightResult: { round: room.settings.round, targetUid: inv.targetUid, isEvil: inv.isEvil },
  })));

  await saveSettings<MafiaSettings>(NS, code, hostId, { ...room.settings, lastDeaths: result.killedUids });
  await setPhase(NS, code, hostId, 'day');
}

export async function startVote(code: string, hostId: string) {
  await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));
  await setPhase(NS, code, hostId, 'vote');
}

export async function castVote(code: string, uid: string, targetUid: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), targetUid);
}

export function watchVotes(code: string, cb: (votes: Record<string, string>) => void) {
  return onValue(ref(requireDb(), `${NS}/rooms/${code}/votes`), (snap) => cb((snap.val() as Record<string, string>) ?? {}));
}

/** Host-only: applies the day vote's result (a Mayor-type role's ballot counts twice) and checks for a winner. */
export async function resolveVote(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the vote');
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}/votes`));
  const votes = (snap.val() as Record<string, string>) ?? {};
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  const { eliminatedUid, tie } = tallyDayVote(votes, dayVoteWeights(secrets));

  if (tie || !eliminatedUid) {
    await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));
    return { tie: true, winner: null as Team | null };
  }

  await updatePlayer<MafiaPlayer>(NS, code, eliminatedUid, { alive: false });
  await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));

  const updatedPlayers = players.map((p) => (p.id === eliminatedUid ? { ...p, alive: false } : p));
  const enginePlayers: EnginePlayer[] = updatedPlayers.map((p) => ({
    id: p.id, alive: p.alive, role: secrets[p.id]?.role ?? '', team: secrets[p.id]?.team ?? 'town',
  }));
  const winner = checkWinner(enginePlayers);

  if (winner) {
    await saveSettings<MafiaSettings>(NS, code, hostId, { ...room.settings, winner });
    await setPhase(NS, code, hostId, 'gameOver');
  } else {
    await saveSettings<MafiaSettings>(NS, code, hostId, { ...room.settings, round: room.settings.round + 1, lastDeaths: [] });
    await setPhase(NS, code, hostId, 'night');
  }
  return { tie: false, winner };
}

export async function leaveMafiaRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`, `${NS}/rooms/${code}/votes/${uid}`]);
}

export async function kickPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
