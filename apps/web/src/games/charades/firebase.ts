import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, watchMySecret,
  type BaseRoom,
} from '@fb/index';
import type { Player } from './game';

const NS = 'charades';

export type RoundSettings = {
  category: string;
  actorId: string;
  team: 'A' | 'B';
  timerSeconds: number;
  roundEndsAt?: number;
  usedWords: string[];
  correctCount: number;
};
export type CharadesRoom = BaseRoom<RoundSettings, Player>;
export type WordSecret = { word: string };

export async function createCharadesRoom(code: string, hostId: string, hostPlayer: Player) {
  await createRoom<RoundSettings, Player>(NS, code, hostId, { ...hostPlayer, team: 'A', score: 0 }, {
    category: 'Movies', actorId: hostId, team: 'A', timerSeconds: 60, usedWords: [], correctCount: 0,
  });
}
export async function joinCharadesRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}
export function watchCharadesRoom(code: string, cb: (r: CharadesRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<CharadesRoom>(NS, code, cb, onError);
}
export function watchMyWord(code: string, uid: string, cb: (s: WordSecret | null) => void) {
  return watchMySecret<WordSecret>(NS, code, uid, cb);
}

export async function startActing(code: string, hostId: string, settings: RoundSettings, actorId: string, word: string) {
  await setSecret<WordSecret>(NS, code, actorId, { word });
  const roundEndsAt = Date.now() + settings.timerSeconds * 1000;
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, actorId, roundEndsAt, correctCount: 0 });
  await setPhase(NS, code, hostId, 'acting');
}

export async function markCorrect(code: string, hostId: string, settings: RoundSettings, actorUid: string, actorScore: number) {
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, correctCount: settings.correctCount + 1, usedWords: settings.usedWords });
  await updatePlayer<Player>(NS, code, actorUid, { score: actorScore + 1 });
}

export async function endRound(code: string, hostId: string, settings: RoundSettings) {
  await saveSettings<RoundSettings>(NS, code, hostId, settings);
  await setPhase(NS, code, hostId, 'roundEnd');
}

export async function backToLobby(code: string, hostId: string) {
  await setPhase(NS, code, hostId, 'lobby');
}

export async function setTeam(code: string, uid: string, team: 'A' | 'B') {
  await updatePlayer<Player>(NS, code, uid, { team });
}
export async function leaveCharadesRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickCharadesPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
