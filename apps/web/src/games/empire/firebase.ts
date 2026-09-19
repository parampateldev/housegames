import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, getAllSecretsOnce, watchAllSecrets,
  publishHostReveal, clearHostReveal, watchHostReveal,
  db,
  type BaseRoom,
} from '@fb/index';
import { get, ref } from 'firebase/database';
import type { Player, CaptureRecord } from './game';

const NS = 'empire';

export type EmpireSettings = { category: string; revealSeconds: number; timerOff: boolean; lastCapture?: CaptureRecord | null };
export type EmpireRoom = BaseRoom<EmpireSettings, Player>;
export type Reveal = { words: string[]; endsAt: number };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}

export async function createEmpireRoom(code: string, hostId: string, hostPlayer: Player, settings: EmpireSettings) {
  await createRoom(NS, code, hostId, hostPlayer, settings);
}

export async function joinEmpireRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}

export function watchEmpireRoom(code: string, cb: (room: EmpireRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<EmpireRoom>(NS, code, cb, onError);
}

export async function submitWord(code: string, uid: string, word: string) {
  await setSecret(NS, code, uid, { word });
  await updatePlayer<Player>(NS, code, uid, { submitted: true });
}

export function watchAllWords(code: string, uids: string[], cb: (subs: Record<string, { word: string }>) => void) {
  return watchAllSecrets<{ word: string }>(NS, code, uids, cb);
}

export async function beginReveal(code: string, hostId: string) {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  const room = snap.val() as EmpireRoom | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const playerIds = Object.keys(room?.players ?? {});
  const secrets = await getAllSecretsOnce<{ word: string }>(NS, code, playerIds);
  const words = Object.values(secrets).map((s) => s.word);
  if (words.length < 1) throw new Error('No words submitted yet');
  const endsAt = room.settings?.timerOff ? 0 : Date.now() + (room.settings?.revealSeconds || 30) * 1000;
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  await publishHostReveal<Reveal>(NS, code, { words: shuffled, endsAt });
  await setPhase(NS, code, hostId, 'reveal');
}

export async function hideReveal(code: string, hostId: string) {
  await setPhase(NS, code, hostId, 'playing');
  await clearHostReveal(NS, code);
}

export function watchReveal(code: string, cb: (r: Reveal | null) => void, onCancel: () => void) {
  return watchHostReveal<Reveal>(NS, code, cb, onCancel);
}

export async function savePlayers(
  code: string, hostId: string, players: Record<string, Player>, phase?: 'playing' | 'finished', lastCapture?: CaptureRecord | null,
) {
  const database = requireDb();
  const snap = await get(ref(database, `${NS}/rooms/${code}`));
  const room = snap.val() as EmpireRoom | null;
  if (room?.hostId !== hostId) throw new Error('Only the host can update the board');
  await Promise.all(Object.values(players).map((p) => updatePlayer<Player>(NS, code, p.id, p)));
  if (lastCapture !== undefined) {
    await saveSettings<EmpireSettings>(NS, code, hostId, { ...(room?.settings ?? { category: '', revealSeconds: 30, timerOff: false }), lastCapture });
  }
  if (phase) await setPhase(NS, code, hostId, phase);
}

export async function saveTheme(code: string, hostId: string, category: string) {
  const database = requireDb();
  const snap = await get(ref(database, `${NS}/rooms/${code}/settings`));
  const settings = (snap.val() as EmpireSettings) ?? { category: '', revealSeconds: 30, timerOff: false };
  await saveSettings<EmpireSettings>(NS, code, hostId, { ...settings, category });
}

export async function saveTimerOff(code: string, hostId: string, timerOff: boolean) {
  const database = requireDb();
  const snap = await get(ref(database, `${NS}/rooms/${code}/settings`));
  const settings = (snap.val() as EmpireSettings) ?? { category: '', revealSeconds: 30, timerOff: false };
  await saveSettings<EmpireSettings>(NS, code, hostId, { ...settings, timerOff });
}

export async function leaveEmpireRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}

export async function kickPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
