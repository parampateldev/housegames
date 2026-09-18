import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, setSecretsForMany, watchMySecret,
  db, type BaseRoom,
} from '@fb/index';
import { get, ref } from 'firebase/database';
import type { Player, Settings, DealResult } from './game';

const NS = 'spyfall';

// discussionEndsAt lives in settings (the only room field the host can
// freely write) — it's cosmetic timing info, not secret, unlike location.
export type SpyfallSettings = Settings & { discussionEndsAt?: number };
export type SpyfallRoom = BaseRoom<SpyfallSettings, Player> & { votes?: Record<string, string> };

// The location is NEVER a public room field — that would leak it straight
// to the spy. It only ever exists inside a per-uid secret: non-spies get it
// as part of their role card; the spy gets it only once the round ends.
export type MySecret =
  | { isSpy: true; location?: string }
  | { isSpy: false; role: string; location: string }
  | { revealed: true; location: string; spyId: string };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createSpyfallRoom(code: string, hostId: string, hostPlayer: Player, settings: SpyfallSettings) {
  await createRoom(NS, code, hostId, hostPlayer, settings);
}
export async function joinSpyfallRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}
export function watchSpyfallRoom(code: string, cb: (r: SpyfallRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<SpyfallRoom>(NS, code, cb, onError);
}
export function watchMySecretRole(code: string, uid: string, cb: (s: MySecret | null) => void) {
  return watchMySecret<MySecret>(NS, code, uid, cb);
}

export async function dealAndStart(code: string, hostId: string, deal: DealResult, timerSeconds: number) {
  const database = requireDb();
  const snap = await get(ref(database, `${NS}/rooms/${code}`));
  const room = snap.val() as SpyfallRoom | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const allIds = Object.keys(room.players ?? {});
  await Promise.all(allIds.map((uid) => (
    uid === deal.spyId
      ? setSecret<MySecret>(NS, code, uid, { isSpy: true })
      : setSecret<MySecret>(NS, code, uid, { isSpy: false, role: deal.roles[uid], location: deal.location })
  )));
  const discussionEndsAt = Date.now() + timerSeconds * 1000;
  await saveSettings<SpyfallSettings>(NS, code, hostId, { timerSeconds, discussionEndsAt });
  await setPhase(NS, code, hostId, 'discussion');
}

export async function castVote(code: string, uid: string, targetUid: string) {
  await ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`).set(targetUid);
}

export async function clearVotes(code: string) {
  await ref(requireDb(), `${NS}/rooms/${code}/votes`).set(null).catch(() => {});
}

/** Fans the real location + spy identity out to every player's own secret path once the round is over. */
export async function revealLocationToAll(code: string, hostId: string, allUids: string[], location: string, spyId: string) {
  await setSecretsForMany<MySecret>(NS, code, allUids, { revealed: true, location, spyId });
  await setPhase(NS, code, hostId, 'results');
}

export async function advancePhase(code: string, hostId: string, phase: 'lobby' | 'roles' | 'discussion' | 'vote' | 'results') {
  await setPhase(NS, code, hostId, phase);
}

export async function leaveSpyfallRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickSpyfallPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
export async function updateSpyfallPlayer(code: string, uid: string, patch: Partial<Player>) {
  await updatePlayer<Player>(NS, code, uid, patch);
}
