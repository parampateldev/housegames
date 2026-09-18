import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, watchMySecret,
  db, type BaseRoom,
} from '@fb/index';
import { get, ref } from 'firebase/database';
import type { Player } from './game';

const NS = 'wavelength';

export type RoundSettings = {
  spectrumLeft: string;
  spectrumRight: string;
  psychicId: string;
  team: 'A' | 'B';
  clue?: string;
  teamGuess?: number;
  opponentCall?: 'left' | 'right';
  scoreA: number;
  scoreB: number;
};
export type WavelengthRoom = BaseRoom<RoundSettings, Player>;
export type TargetSecret = { target: number };

function requireDb() { if (!db) throw new Error('Firebase is not configured'); return db; }

export async function createWavelengthRoom(code: string, hostId: string, hostPlayer: Player) {
  await createRoom<RoundSettings, Player>(NS, code, hostId, { ...hostPlayer, team: 'A' }, {
    spectrumLeft: '', spectrumRight: '', psychicId: hostId, team: 'A', scoreA: 0, scoreB: 0,
  });
}
export async function joinWavelengthRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}
export function watchWavelengthRoom(code: string, cb: (r: WavelengthRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<WavelengthRoom>(NS, code, cb, onError);
}
export function watchMyTarget(code: string, uid: string, cb: (s: TargetSecret | null) => void) {
  return watchMySecret<TargetSecret>(NS, code, uid, cb);
}

export async function startRound(code: string, hostId: string, psychicId: string, team: 'A' | 'B', left: string, right: string, target: number, scoreA: number, scoreB: number) {
  await setSecret<TargetSecret>(NS, code, psychicId, { target });
  await saveSettings<RoundSettings>(NS, code, hostId, { spectrumLeft: left, spectrumRight: right, psychicId, team, scoreA, scoreB });
  await setPhase(NS, code, hostId, 'psychicSees');
}

export async function submitClue(code: string, hostId: string, settings: RoundSettings, clue: string) {
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, clue });
  await setPhase(NS, code, hostId, 'teamGuess');
}

export async function submitTeamGuess(code: string, hostId: string, settings: RoundSettings, teamGuess: number) {
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, teamGuess });
  await setPhase(NS, code, hostId, 'opponentCall');
}

export async function submitOpponentCall(code: string, hostId: string, settings: RoundSettings, call: 'left' | 'right') {
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, opponentCall: call });
  await setPhase(NS, code, hostId, 'reveal');
}

export async function revealTarget(code: string, psychicUid: string): Promise<number> {
  const snap = await get(ref(requireDb(), `${NS}/secrets/${code}/${psychicUid}`));
  return (snap.val() as TargetSecret | null)?.target ?? 50;
}

export async function finishRound(code: string, hostId: string, settings: RoundSettings) {
  await saveSettings<RoundSettings>(NS, code, hostId, settings);
  await setPhase(NS, code, hostId, 'lobby');
}

export async function setTeam(code: string, uid: string, team: 'A' | 'B') {
  await updatePlayer<Player>(NS, code, uid, { team });
}
export async function leaveWavelengthRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickWavelengthPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
