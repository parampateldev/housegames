import {
  ref, set, update, get, remove, onValue, type Database,
} from 'firebase/database';
import { db, auth } from './firebase';
import { recordRecentRoom } from './users';

export type BasePlayer = { id: string; name: string; connected?: boolean };

export type BaseRoom<Settings, Player extends BasePlayer = BasePlayer> = {
  hostId: string;
  phase: string;
  createdAt: number;
  settings: Settings;
  players: Record<string, Player>;
};

function requireDb(): Database {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export const roomPath = (ns: string, code: string) => `${ns}/rooms/${code}`;
export const roomRef = (ns: string, code: string) => ref(requireDb(), roomPath(ns, code));

/**
 * Every game's createRoom/joinRoom funnels through here so "recent rooms"
 * on the dashboard works platform-wide with no per-game wiring. Silent
 * no-op for guests (no persistent profile to attach it to) and never
 * throws, a failed recent-room write must never block joining a room.
 */
function rememberRoomForSignedInUser(ns: string, code: string, role: 'host' | 'guest') {
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) return;
  recordRecentRoom(user.uid, { gameSlug: ns, code, role, at: Date.now() }).catch(() => {});
}

export function watchRoom<R extends BaseRoom<unknown>>(
  ns: string,
  code: string,
  cb: (room: R | null) => void,
  onError?: (message: string) => void,
) {
  return onValue(
    roomRef(ns, code),
    (snap) => cb(snap.val() as R | null),
    (err) => onError?.(err.message),
  );
}

export async function createRoom<Settings, Player extends BasePlayer>(
  ns: string,
  code: string,
  hostId: string,
  hostPlayer: Player,
  settings: Settings,
  initialPhase = 'lobby',
): Promise<void> {
  const database = requireDb();
  await update(ref(database), {
    [`${roomPath(ns, code)}/hostId`]: hostId,
    [`${roomPath(ns, code)}/phase`]: initialPhase,
    [`${roomPath(ns, code)}/createdAt`]: Date.now(),
    [`${roomPath(ns, code)}/settings`]: settings,
    [`${roomPath(ns, code)}/players/${hostId}`]: hostPlayer,
  });
  rememberRoomForSignedInUser(ns, code, 'host');
}

export async function joinRoom<Player extends BasePlayer>(ns: string, code: string, player: Player): Promise<void> {
  await set(ref(requireDb(), `${roomPath(ns, code)}/players/${player.id}`), player);
  rememberRoomForSignedInUser(ns, code, 'guest');
}

export async function roomExists(ns: string, code: string): Promise<boolean> {
  const snap = await get(roomRef(ns, code));
  return snap.exists();
}

/** Host-authoritative phase change. Rules re-check this write, not a clock, see docs. */
export async function setPhase(ns: string, code: string, hostId: string, phase: string): Promise<void> {
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<unknown> | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can advance the game');
  await set(ref(requireDb(), `${roomPath(ns, code)}/phase`), phase);
}

/**
 * Grants a non-host player (this round's czar, spymaster, artist, ...)
 * read/write on `secrets` and `hostReveals` for the room, without widening
 * any rule beyond one more dynamic uid lookup, see scripts/build-rules.mjs.
 * Only the host may call this.
 */
export async function setPrivilegedUid(ns: string, code: string, hostId: string, targetUid: string | null): Promise<void> {
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<unknown> | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can grant round privileges');
  await set(ref(requireDb(), `${roomPath(ns, code)}/privilegedUid`), targetUid);
}

export async function saveSettings<Settings>(ns: string, code: string, hostId: string, settings: Settings): Promise<void> {
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<Settings> | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can change settings');
  await set(ref(requireDb(), `${roomPath(ns, code)}/settings`), settings);
}

export async function updatePlayer<Player extends BasePlayer>(
  ns: string,
  code: string,
  uid: string,
  patch: Partial<Player>,
): Promise<void> {
  await update(ref(requireDb(), `${roomPath(ns, code)}/players/${uid}`), patch);
}

/** Hands host to any uid already in the room, the rules require the target to be a current player. */
export async function makeHost(ns: string, code: string, currentHostId: string, targetUid: string): Promise<void> {
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<unknown> | null;
  if (room?.hostId !== currentHostId) throw new Error('Only the host can hand off host');
  if (!room.players?.[targetUid]) throw new Error('That player is not in the room');
  await set(ref(requireDb(), `${roomPath(ns, code)}/hostId`), targetUid);
}

/**
 * A player with no device of their own: the host adds them by name only.
 * They get a synthetic id the host can write on their behalf anywhere a
 * normal player's own uid would be used (the security rules already grant
 * the host read/write on any uid's player/secret data, so no rule changes
 * are needed here).
 */
export async function addLocalPlayer<Player extends BasePlayer>(
  ns: string,
  code: string,
  hostId: string,
  name: string,
  makePlayer: (id: string, name: string) => Player,
): Promise<string> {
  const localId = `local-${Math.random().toString(36).slice(2, 10)}`;
  await joinRoom(ns, code, makePlayer(localId, name));
  return localId;
}

export async function removePlayer(ns: string, code: string, hostId: string, targetUid: string): Promise<void> {
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<unknown> | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can remove players');
  if (targetUid === hostId) throw new Error('The host cannot remove themselves');
  await remove(ref(requireDb(), `${roomPath(ns, code)}/players/${targetUid}`));
}

/**
 * Leaving player is dropped; if they were host, the lexicographically-smallest
 * remaining uid becomes host (deterministic, every client computes the same
 * winner with no coordination). Room is deleted once nobody remains.
 */
export async function leaveRoom(ns: string, code: string, uid: string, extraPathsToClear: string[] = []): Promise<void> {
  const database = requireDb();
  const snap = await get(roomRef(ns, code));
  const room = snap.val() as BaseRoom<unknown> | null;
  if (!room?.players?.[uid]) return;

  const clears = Object.fromEntries(extraPathsToClear.map((p) => [p, null]));

  if (room.hostId !== uid) {
    await update(ref(database), {
      [`${roomPath(ns, code)}/players/${uid}`]: null,
      ...clears,
    });
    return;
  }

  const nextHost = Object.keys(room.players).filter((id) => id !== uid).sort()[0];
  if (!nextHost) {
    await update(ref(database), {
      [roomPath(ns, code)]: null,
      ...clears,
    });
    return;
  }

  await update(ref(database), {
    [`${roomPath(ns, code)}/hostId`]: nextHost,
    [`${roomPath(ns, code)}/players/${uid}`]: null,
    ...clears,
  });
}
