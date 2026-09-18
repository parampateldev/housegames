import { ref, set, update, remove, onValue, get, type Database } from 'firebase/database';
import { db } from './firebase';

/**
 * The platform's one secrecy primitive. A secret NEVER lives inside the
 * publicly-readable room node, it lives at its own path, gated per-uid, so
 * a client that isn't an intended viewer can never read it, not even
 * briefly. Security rules for every game grant:
 *   secrets/$room/$uid  .read: auth.uid === $uid || <current hostId>
 *   secrets/$room/$uid  .write: <current hostId only>
 * To show the same secret to several players (e.g. "everyone but the
 * active player"), fan the same value out to each intended uid's own path, * never widen a single path's read rule to a group.
 */
function requireDb(): Database {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

const secretPath = (ns: string, code: string, uid: string) => `${ns}/secrets/${code}/${uid}`;

export async function setSecret<T>(ns: string, code: string, uid: string, data: T): Promise<void> {
  await set(ref(requireDb(), secretPath(ns, code, uid)), data);
}

export async function setSecretsForMany<T>(ns: string, code: string, uids: string[], data: T): Promise<void> {
  const database = requireDb();
  const patch: Record<string, T> = {};
  for (const uid of uids) patch[secretPath(ns, code, uid)] = data;
  await update(ref(database), patch);
}

export async function clearSecret(ns: string, code: string, uid: string): Promise<void> {
  await remove(ref(requireDb(), secretPath(ns, code, uid)));
}

export async function clearSecretsForMany(ns: string, code: string, uids: string[]): Promise<void> {
  const database = requireDb();
  const patch: Record<string, null> = {};
  for (const uid of uids) patch[secretPath(ns, code, uid)] = null;
  await update(ref(database), patch);
}

export function watchMySecret<T>(ns: string, code: string, uid: string, cb: (secret: T | null) => void): () => void {
  return onValue(ref(requireDb(), secretPath(ns, code, uid)), (snap) => cb(snap.val() as T | null), () => cb(null));
}

export async function getSecretOnce<T>(ns: string, code: string, uid: string): Promise<T | null> {
  const snap = await get(ref(requireDb(), secretPath(ns, code, uid)));
  return snap.val() as T | null;
}

export async function getAllSecretsOnce<T>(ns: string, code: string, uids: string[]): Promise<Record<string, T>> {
  const database = requireDb();
  const entries = await Promise.all(uids.map(async (uid) => {
    const snap = await get(ref(database, secretPath(ns, code, uid)));
    return [uid, snap.val() as T | null] as const;
  }));
  const out: Record<string, T> = {};
  for (const [uid, val] of entries) if (val !== null) out[uid] = val;
  return out;
}

/**
 * Fan-in read for the host: subscribes to each listed uid's secret path
 * individually (the rules only ever grant per-uid reads, never a blanket
 * "secrets/$room" read) and reports the merged map on every change.
 */
export function watchAllSecrets<T>(ns: string, code: string, uids: string[], cb: (secrets: Record<string, T>) => void): () => void {
  const current: Record<string, T> = {};
  const offs = uids.map((uid) => onValue(
    ref(requireDb(), secretPath(ns, code, uid)),
    (snap) => {
      if (snap.exists()) current[uid] = snap.val() as T;
      else delete current[uid];
      cb({ ...current });
    },
    () => {},
  ));
  return () => offs.forEach((off) => off());
}

/**
 * Host-only aggregate reveal (Empire's pattern): the node is readable by
 * anyone while empty, so every client can attach a listener without a
 * permission error, but the moment the host writes data into it, the rule
 * restricts reads to whoever the room's CURRENT host is. Access is decided
 * purely by that write, never by a clock, and it re-resolves automatically
 * if host migrates mid-round.
 */
const hostRevealPath = (ns: string, code: string) => `${ns}/hostReveals/${code}`;

export async function publishHostReveal<T>(ns: string, code: string, data: T): Promise<void> {
  await set(ref(requireDb(), hostRevealPath(ns, code)), data);
}

export async function clearHostReveal(ns: string, code: string): Promise<void> {
  await remove(ref(requireDb(), hostRevealPath(ns, code)));
}

export function watchHostReveal<T>(ns: string, code: string, cb: (data: T | null) => void, onCancel?: () => void): () => void {
  return onValue(ref(requireDb(), hostRevealPath(ns, code)), (snap) => cb(snap.val() as T | null), () => onCancel?.());
}
