import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, watchMySecret, clearSecret,
  db,
  type BaseRoom,
} from '@fb/index';
import {
  get, ref, push, onChildAdded, remove, query, limitToLast,
} from 'firebase/database';
import type { Player, Settings, Stroke } from './game';

const NS = 'pictionary';

export type PictionaryRoom = BaseRoom<Settings, Player>;
export type Word = { word: string; category: string };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createPictionaryRoom(code: string, hostId: string, hostPlayer: Player, settings: Settings) {
  await createRoom(NS, code, hostId, hostPlayer, settings);
}

export async function joinPictionaryRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}

export function watchPictionaryRoom(code: string, cb: (room: PictionaryRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<PictionaryRoom>(NS, code, cb, onError);
}

export async function advanceSettings(code: string, hostId: string, settings: Settings) {
  await saveSettings<Settings>(NS, code, hostId, settings);
}

export async function setRoundWord(code: string, artistId: string, word: Word) {
  await setSecret(NS, code, artistId, word);
}

export function watchMyWord(code: string, uid: string, cb: (word: Word | null) => void) {
  return watchMySecret<Word>(NS, code, uid, cb);
}

export async function clearRoundWord(code: string, artistId: string) {
  await clearSecret(NS, code, artistId);
}

export async function awardPoint(code: string, guesserId: string, newScore: number) {
  await updatePlayer<Player>(NS, code, guesserId, { score: newScore });
}

export async function setPictionaryPhase(code: string, hostId: string, phase: 'lobby' | 'drawing' | 'roundEnd' | 'finished') {
  await setPhase(NS, code, hostId, phase);
}

export async function leavePictionaryRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}

export async function kickPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}

// --- Strokes: an append-only list per round, so a late joiner can replay ---
// history and no client streams raw pointermove events (see game.ts's
// decimateStroke for the write-size cap). NOTE FOR COORDINATOR: this path
// (pictionary/strokes/$room/$round) is NOT covered by the generic per-game
// rule template (rooms/secrets/hostReveals/votes) — it needs its own rule.
// Recommended addition to scripts/build-rules.mjs's gameRules('pictionary')
// output, alongside the existing rooms/secrets/hostReveals block:
//   strokes: { $room: { $round: { '.read': 'auth != null', '.write': 'auth != null' } } }
// Drawing strokes aren't secret (only the WORD is, via the existing secrets
// mechanism), so a blanket "any signed-in room member" read/write is
// reasonable — tighten to host-or-current-artist-only if desired later.
const strokesPath = (code: string, round: number) => `${NS}/strokes/${code}/${round}`;

export async function pushStroke(code: string, round: number, stroke: Stroke) {
  await push(ref(requireDb(), strokesPath(code, round)), stroke);
}

/** Replays existing strokes in order, then reports new ones as they arrive. */
export function watchStrokes(code: string, round: number, cb: (stroke: Stroke) => void): () => void {
  const strokesRef = query(ref(requireDb(), strokesPath(code, round)), limitToLast(2000));
  const off = onChildAdded(strokesRef, (snap) => cb(snap.val() as Stroke));
  return () => off();
}

export async function clearStrokes(code: string, round: number) {
  await remove(ref(requireDb(), strokesPath(code, round)));
}

export async function getRoomOnce(code: string): Promise<PictionaryRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as PictionaryRoom | null;
}
