import { ref, set, update, get, onValue, type Database } from 'firebase/database';
import { db } from './firebase';

export type RecentRoom = {
  gameSlug: string;
  code: string;
  role: 'host' | 'guest';
  at: number;
};

export type UserProfile = {
  displayName: string;
  avatarColor: string;
  recentRooms?: Record<string, RecentRoom>;
};

const MAX_RECENT = 10;

function requireDb(): Database {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

const AVATAR_COLORS = ['#bd3e29', '#28794b', '#8b7f75', '#e5aa74', '#2b5c8a', '#7a3f9d'];

export function pickAvatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export async function ensureProfile(uid: string, displayName: string): Promise<void> {
  const database = requireDb();
  const snap = await get(ref(database, `users/${uid}`));
  if (snap.exists()) return;
  const profile: UserProfile = { displayName, avatarColor: pickAvatarColor(uid) };
  await set(ref(database, `users/${uid}`), profile);
}

export function watchProfile(uid: string, cb: (profile: UserProfile | null) => void): () => void {
  return onValue(ref(requireDb(), `users/${uid}`), (snap) => cb(snap.val() as UserProfile | null));
}

/** Keeps only the most recent MAX_RECENT rooms, newest first. */
export async function recordRecentRoom(uid: string, entry: RecentRoom): Promise<void> {
  const database = requireDb();
  const snap = await get(ref(database, `users/${uid}/recentRooms`));
  const existing = (snap.val() as Record<string, RecentRoom> | null) ?? {};
  const list = Object.values(existing).filter((r) => r.code !== entry.code).concat(entry);
  list.sort((a, b) => b.at - a.at);
  const trimmed = list.slice(0, MAX_RECENT);
  const next: Record<string, RecentRoom> = {};
  for (const r of trimmed) next[`${r.gameSlug}_${r.code}`] = r;
  await update(ref(database), { [`users/${uid}/recentRooms`]: next });
}
