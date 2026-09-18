import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecretsForMany, clearSecretsForMany, watchMySecret,
  type BaseRoom,
} from '@fb/index';
import type { Player } from './game';

const NS = 'headsUp';

export type RoundSettings = {
  category: string;
  guesserId: string;
  timerSeconds: number;
  roundEndsAt?: number;
  usedWords: string[];
  correctCount: number;
};
export type HeadsUpRoom = BaseRoom<RoundSettings, Player>;
export type WordSecret = { word: string };

export async function createHeadsUpRoom(code: string, hostId: string, hostPlayer: Player) {
  await createRoom<RoundSettings, Player>(NS, code, hostId, { ...hostPlayer, score: 0 }, {
    category: 'Animals', guesserId: hostId, timerSeconds: 60, usedWords: [], correctCount: 0,
  });
}
export async function joinHeadsUpRoom(code: string, player: Player) {
  await joinRoom(NS, code, player);
}
export function watchHeadsUpRoom(code: string, cb: (r: HeadsUpRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<HeadsUpRoom>(NS, code, cb, onError);
}
/** Guesser never has a secret written for them, so this naturally returns null on their own screen. */
export function watchMyWord(code: string, uid: string, cb: (s: WordSecret | null) => void) {
  return watchMySecret<WordSecret>(NS, code, uid, cb);
}

export async function startGuessing(code: string, hostId: string, settings: RoundSettings, guesserId: string, audienceUids: string[], word: string) {
  await clearSecretsForMany(NS, code, [...audienceUids, guesserId]);
  await setSecretsForMany<WordSecret>(NS, code, audienceUids, { word });
  const roundEndsAt = Date.now() + settings.timerSeconds * 1000;
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, guesserId, roundEndsAt, correctCount: 0 });
  await setPhase(NS, code, hostId, 'guessing');
}

export async function nextWordSameRound(code: string, hostId: string, settings: RoundSettings, audienceUids: string[], word: string, correctCount: number) {
  await setSecretsForMany<WordSecret>(NS, code, audienceUids, { word });
  await saveSettings<RoundSettings>(NS, code, hostId, { ...settings, correctCount });
}

export async function endRound(code: string, hostId: string, settings: RoundSettings, guesserUid: string, guesserScore: number) {
  await saveSettings<RoundSettings>(NS, code, hostId, settings);
  await updatePlayer<Player>(NS, code, guesserUid, { score: guesserScore + settings.correctCount });
  await setPhase(NS, code, hostId, 'roundEnd');
}

export async function backToLobby(code: string, hostId: string) {
  await setPhase(NS, code, hostId, 'lobby');
}
export async function leaveHeadsUpRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickHeadsUpPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
