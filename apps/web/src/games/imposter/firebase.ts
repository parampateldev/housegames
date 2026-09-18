import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, leaveRoom,
  setSecretsForMany, getAllSecretsOnce, watchMySecret as watchMySecretPrimitive,
  db, type BaseRoom,
} from '@fb/index';
import { get, ref, set, update } from 'firebase/database';
import type { Player, ImposterSettings, Secret } from './game';

const NS = 'imposter';

export type ImposterRoom = BaseRoom<ImposterSettings, Player> & { votes?: Record<string, string> };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createImposterRoom(code: string, hostId: string, hostPlayer: Player, settings: ImposterSettings) {
  await createRoom(NS, code, hostId, hostPlayer, settings);
}

export async function joinImposterRoom(code: string, player: Player) {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  const room = snap.val() as ImposterRoom | null;
  if (!room) throw new Error("No room with that code. Check the link or code and try again.");
  const players = room.players || {};
  if (Object.keys(players).length >= 20) throw new Error('That room is full (20 players).');
  const clash = Object.values(players).some((p) => p.id !== player.id && p.name.toLowerCase() === player.name.toLowerCase());
  if (clash) throw new Error('Someone in that room already has that name.');
  await joinRoom(NS, code, player);
}

export function watchImposterRoom(code: string, cb: (room: ImposterRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<ImposterRoom>(NS, code, cb, onError);
}

export function watchMySecret(code: string, uid: string, cb: (s: Secret | null) => void) {
  return watchMySecretPrimitive<Secret>(NS, code, uid, cb);
}

export async function saveImposterSettings(code: string, hostId: string, settings: ImposterSettings) {
  await saveSettings<ImposterSettings>(NS, code, hostId, settings);
}

export async function setReady(code: string, uid: string, ready: boolean) {
  await updatePlayer<Player>(NS, code, uid, { ready });
}

export async function setClue(code: string, uid: string, clue: string) {
  await updatePlayer<Player>(NS, code, uid, { clue });
}

export async function castVote(code: string, uid: string, targetUid: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), targetUid);
}

export async function clearVotes(code: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes`), null);
}

export async function leaveImposterRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}

export async function getRoomOnce(code: string): Promise<ImposterRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as ImposterRoom | null;
}

export async function dealSecrets(code: string, secretsByUid: Record<string, Secret>) {
  const database = requireDb();
  const patch: Record<string, Secret> = {};
  for (const [uid, s] of Object.entries(secretsByUid)) patch[`${NS}/secrets/${code}/${uid}`] = s;
  await update(ref(database), patch);
}

export async function getAllImposterSecrets(code: string, uids: string[]): Promise<Record<string, Secret>> {
  return getAllSecretsOnce<Secret>(NS, code, uids);
}

export async function getMySecretOnce(code: string, uid: string): Promise<Secret | null> {
  const snap = await get(ref(requireDb(), `${NS}/secrets/${code}/${uid}`));
  return snap.val() as Secret | null;
}

export async function setRoomPhase(code: string, hostId: string, phase: ImposterRoom['phase']) {
  await setPhase(NS, code, hostId, phase);
}

export { setSecretsForMany };
