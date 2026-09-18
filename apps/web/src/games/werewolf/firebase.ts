import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, getAllSecretsOnce, watchMySecret as watchMySecretGeneric, watchAllSecrets,
  db, type BaseRoom,
} from '@fb/index';
import {
  assignRoles as engineAssignRoles, resolveNight as engineResolveNight, tallyDayVote, checkWinner, defaultWerewolfRoles,
  type EnginePlayer, type Team,
} from '@engines/elimination/index';
import { get, ref, set, update, remove, onValue } from 'firebase/database';
import {
  buildNightActions, allNightActionsIn, WEREWOLF_TEAM_OF,
  type WerewolfPlayer, type WerewolfSettings, type WerewolfSecret, type WerewolfRoleId,
} from './game';

const NS = 'werewolf';

export type WerewolfRoom = BaseRoom<WerewolfSettings, WerewolfPlayer>;

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createWerewolfRoom(code: string, hostId: string, hostPlayer: WerewolfPlayer) {
  const settings: WerewolfSettings = { roleConfig: [], round: 0, lastDeaths: [], winner: null };
  await createRoom(NS, code, hostId, hostPlayer, settings);
}

export async function joinWerewolfRoom(code: string, player: WerewolfPlayer) {
  await joinRoom(NS, code, player);
}

export function watchWerewolfRoom(code: string, cb: (room: WerewolfRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<WerewolfRoom>(NS, code, cb, onError);
}

export function watchMySecret(code: string, uid: string, cb: (s: WerewolfSecret | null) => void) {
  return watchMySecretGeneric<WerewolfSecret>(NS, code, uid, cb);
}

/** Host-only: reads every local (no-device) player's role/night-action state so the host can act for them. */
export function watchLocalSecrets(code: string, localUids: string[], cb: (secrets: Record<string, WerewolfSecret>) => void) {
  return watchAllSecrets<WerewolfSecret>(NS, code, localUids, cb);
}

async function getRoom(code: string): Promise<WerewolfRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as WerewolfRoom | null;
}

/** Host-only: assigns roles once, writes each player's own secret, starts round 1. */
export async function assignRolesAndStartNight(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const players = Object.values(room.players ?? {});
  if (players.length < 4) throw new Error('Need at least 4 players');
  const roleConfig = defaultWerewolfRoles(players.length);
  const roles = engineAssignRoles(players.map((p) => p.id), roleConfig) as Record<string, WerewolfRoleId>;

  const evilNames = players.filter((p) => roles[p.id] === 'evil').map((p) => p.name);
  await Promise.all(players.map((p) => {
    const role = roles[p.id];
    const secret: WerewolfSecret = role === 'evil' ? { role, teammates: evilNames.filter((n) => n !== p.name) } : { role };
    return setSecret<WerewolfSecret>(NS, code, p.id, secret);
  }));

  await saveSettings<WerewolfSettings>(NS, code, hostId, { roleConfig, round: 1, lastDeaths: [], winner: null });
  await setPhase(NS, code, hostId, 'night');
}

/** Merge-updates the acting player's OWN secret with their pick, keeping `role` intact. */
export async function submitNightAction(code: string, uid: string, round: number, targetUid: string) {
  await update(ref(requireDb(), `${NS}/secrets/${code}/${uid}`), { nightAction: { round, targetUid } });
}

/** Witch-only: her poison is independent of her save, tracked separately. */
export async function submitWitchPoison(code: string, uid: string, round: number, targetUid: string) {
  await update(ref(requireDb(), `${NS}/secrets/${code}/${uid}`), { nightPoison: { round, targetUid }, witchPoisonUsed: true });
}

export async function markWitchSaveUsed(code: string, uid: string) {
  await update(ref(requireDb(), `${NS}/secrets/${code}/${uid}`), { witchSaveUsed: true });
}

export async function nightActionsReady(code: string, alivePlayerIds: string[]): Promise<boolean> {
  const room = await getRoom(code);
  if (!room) return false;
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<WerewolfSecret>(NS, code, players.map((p) => p.id));
  const roles = Object.fromEntries(players.map((p) => [p.id, secrets[p.id]?.role]).filter(([, r]) => r)) as Record<string, WerewolfRoleId>;
  return allNightActionsIn(secrets, roles, alivePlayerIds, room.settings.round);
}

/** Host-only: resolves the night (doctor-save-before-kill etc handled by the shared engine), applies deaths, advances to day. */
export async function resolveNightPhase(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the night');
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<WerewolfSecret>(NS, code, players.map((p) => p.id));
  const roles = Object.fromEntries(players.map((p) => [p.id, secrets[p.id]?.role]).filter(([, r]) => r)) as Record<string, WerewolfRoleId>;
  const teamByUid = Object.fromEntries(players.map((p) => [p.id, WEREWOLF_TEAM_OF[roles[p.id]] ?? 'town'])) as Record<string, Team>;

  const submissions = buildNightActions(secrets, roles, room.settings.round);
  const result = engineResolveNight(submissions, teamByUid);

  await Promise.all(result.killedUids.map((uid) => updatePlayer<WerewolfPlayer>(NS, code, uid, { alive: false })));

  await Promise.all(result.investigations.map((inv) => update(ref(requireDb(), `${NS}/secrets/${code}/${inv.investigatorUid}`), {
    nightResult: { round: room.settings.round, targetUid: inv.targetUid, isEvil: inv.isEvil },
  })));

  await saveSettings<WerewolfSettings>(NS, code, hostId, { ...room.settings, lastDeaths: result.killedUids });
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

/** Host-only: applies the day vote's result and checks for a winner. */
export async function resolveVote(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the vote');
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}/votes`));
  const votes = (snap.val() as Record<string, string>) ?? {};
  const { eliminatedUid, tie } = tallyDayVote(votes);

  if (tie || !eliminatedUid) {
    await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));
    return { tie: true, winner: null as 'town' | 'evil' | null };
  }

  await updatePlayer<WerewolfPlayer>(NS, code, eliminatedUid, { alive: false });
  await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));

  const players = Object.values(room.players ?? {}).map((p) => (p.id === eliminatedUid ? { ...p, alive: false } : p));
  const secrets = await getAllSecretsOnce<WerewolfSecret>(NS, code, players.map((p) => p.id));
  const enginePlayers: EnginePlayer[] = players.map((p) => {
    const role = secrets[p.id]?.role ?? 'villager';
    return { id: p.id, alive: p.alive, role, team: WEREWOLF_TEAM_OF[role] };
  });
  const winner = checkWinner(enginePlayers);

  if (winner) {
    await saveSettings<WerewolfSettings>(NS, code, hostId, { ...room.settings, winner });
    await setPhase(NS, code, hostId, 'gameOver');
  } else {
    await saveSettings<WerewolfSettings>(NS, code, hostId, { ...room.settings, round: room.settings.round + 1, lastDeaths: [] });
    await setPhase(NS, code, hostId, 'night');
  }
  return { tie: false, winner };
}

export async function leaveWerewolfRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`, `${NS}/rooms/${code}/votes/${uid}`]);
}

export async function kickPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
