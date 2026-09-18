import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, getAllSecretsOnce, watchMySecret as watchMySecretGeneric, watchAllSecrets,
  db, type BaseRoom,
} from '@fb/index';
import {
  assignRoles as engineAssignRoles, resolveNight as engineResolveNight, tallyDayVote, checkWinner, defaultMafiaRoles,
  type RoleDef, type RoleId, type EnginePlayer,
} from '@engines/elimination/index';
import { get, ref, set, update, remove, onValue } from 'firebase/database';
import {
  buildNightActions, allNightActionsIn,
  type MafiaPlayer, type MafiaSettings, type MafiaSecret,
} from './game';

const NS = 'mafia';

export type MafiaRoom = BaseRoom<MafiaSettings, MafiaPlayer>;

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

/** Host-only: assigns roles once, writes each player's own secret, starts round 1. */
export async function assignRolesAndStartNight(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const players = Object.values(room.players ?? {});
  if (players.length < 4) throw new Error('Need at least 4 players');
  const roleConfig = defaultMafiaRoles(players.length);
  const roles = engineAssignRoles(players.map((p) => p.id), roleConfig);

  const evilNames = players.filter((p) => roles[p.id] === 'evil').map((p) => p.name);
  await Promise.all(players.map((p) => {
    const role = roles[p.id];
    const secret: MafiaSecret = role === 'evil' ? { role, teammates: evilNames.filter((n) => n !== p.name) } : { role };
    return setSecret<MafiaSecret>(NS, code, p.id, secret);
  }));

  await saveSettings<MafiaSettings>(NS, code, hostId, { roleConfig, round: 1, lastDeaths: [], winner: null });
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
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  const roles = Object.fromEntries(players.map((p) => [p.id, secrets[p.id]?.role]).filter(([, r]) => r)) as Record<string, RoleId>;
  return allNightActionsIn(secrets, roles, alivePlayerIds, room.settings.round);
}

/** Host-only: resolves the night (doctor-save-before-kill etc handled by the shared engine), applies deaths, advances to day. */
export async function resolveNightPhase(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the night');
  const players = Object.values(room.players ?? {});
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  const roles = Object.fromEntries(players.map((p) => [p.id, secrets[p.id]?.role]).filter(([, r]) => r)) as Record<string, RoleId>;

  const actions = buildNightActions(secrets, roles, room.settings.round);
  const result = engineResolveNight(actions, roles);

  await Promise.all(result.killedUids.map((uid) => updatePlayer<MafiaPlayer>(NS, code, uid, { alive: false })));

  if (result.investigation) {
    const targetUid = result.investigation.targetUid;
    const detectiveUid = Object.entries(roles).find(([id, r]) => r === 'detective' && secrets[id]?.nightAction?.targetUid === targetUid)?.[0];
    if (detectiveUid) {
      await update(ref(requireDb(), `${NS}/secrets/${code}/${detectiveUid}`), {
        nightResult: { round: room.settings.round, targetUid, isEvil: result.investigation.isEvil },
      });
    }
  }

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

  await updatePlayer<MafiaPlayer>(NS, code, eliminatedUid, { alive: false });
  await remove(ref(requireDb(), `${NS}/rooms/${code}/votes`));

  const players = Object.values(room.players ?? {}).map((p) => (p.id === eliminatedUid ? { ...p, alive: false } : p));
  const secrets = await getAllSecretsOnce<MafiaSecret>(NS, code, players.map((p) => p.id));
  const enginePlayers: EnginePlayer[] = players.map((p) => ({ id: p.id, alive: p.alive, role: secrets[p.id]?.role ?? 'villager' }));
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
