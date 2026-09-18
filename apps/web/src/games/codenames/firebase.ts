import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, removePlayer, leaveRoom,
  setSecretsForMany, watchMySecret,
  db, type BaseRoom, type BasePlayer,
} from '@fb/index';
import { get, ref, set, update, onValue } from 'firebase/database';
import { buildBoard, codenamesWinnerOnAssassinTap, type CellColor, type TeamColor } from './game';
import { CODENAMES_WORDS } from './words';

const NS = 'codenames';

export type CNPlayer = BasePlayer & { team: TeamColor | null; spymaster: boolean };
export type CNPhase = 'lobby' | 'clue' | 'guessing' | 'gameOver';
export type CNSettings = {
  words: string[];
  revealed: boolean[];
  /** Once a cell is revealed, its color becomes public knowledge, this is what everyone (not just spymasters) sees for it. */
  revealedColors: (CellColor | null)[];
  turn: TeamColor;
  clueWord: string | null;
  clueNumber: number | null;
  guessesLeft: number;
  winner: TeamColor | null;
  redSpymaster: string | null;
  blueSpymaster: string | null;
  // The host (and everyone else) never holds the color key, only the two
  // spymasters do (see CNKeySecret). So "words exhausted" win-checking runs
  // on these two public counters instead, each decremented by whichever
  // spymaster resolves a guess for their own team (see resolveGuess).
  redRemaining: number;
  blueRemaining: number;
};
export type CNRoom = BaseRoom<CNSettings, CNPlayer> & { phase: CNPhase };
export type CNKeySecret = { key: CellColor[] };

function requireDb() { if (!db) throw new Error('Firebase is not configured'); return db; }
async function getRoom(code: string): Promise<CNRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as CNRoom | null;
}

export async function createCNRoom(code: string, hostId: string, hostName: string) {
  await createRoom<CNSettings, CNPlayer>(NS, code, hostId, { id: hostId, name: hostName, team: null, spymaster: false }, {
    words: [], revealed: [], revealedColors: [], turn: 'red', clueWord: null, clueNumber: null, guessesLeft: 0, winner: null,
    redSpymaster: null, blueSpymaster: null, redRemaining: 0, blueRemaining: 0,
  });
}
export async function joinCNRoom(code: string, uid: string, name: string) {
  await joinRoom<CNPlayer>(NS, code, { id: uid, name, team: null, spymaster: false });
}
export function watchCNRoom(code: string, cb: (r: CNRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<CNRoom>(NS, code, cb, onError);
}
export function watchMyKey(code: string, uid: string, cb: (secret: CNKeySecret | null) => void) {
  return watchMySecret<CNKeySecret>(NS, code, uid, cb);
}

export async function joinTeam(code: string, uid: string, team: TeamColor) {
  await update(ref(requireDb(), `${NS}/rooms/${code}/players/${uid}`), { team });
}

export async function becomeSpymaster(code: string, hostId: string, uid: string, team: TeamColor) {
  const room = await getRoom(code);
  if (!room) return;
  const field = team === 'red' ? 'redSpymaster' : 'blueSpymaster';
  await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, [field]: uid });
  await update(ref(requireDb(), `${NS}/rooms/${code}/players/${uid}`), { spymaster: true, team });
}

/** Host-only: builds the board, publishes public words, and sends the key to ONLY the two spymasters. */
export async function startCNGame(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  if (!room.settings.redSpymaster || !room.settings.blueSpymaster) throw new Error('Both teams need a spymaster');

  const { words, key, startingTeam } = buildBoard(CODENAMES_WORDS);
  await setSecretsForMany<CNKeySecret>(NS, code, [room.settings.redSpymaster, room.settings.blueSpymaster], { key });
  const otherTeam: TeamColor = startingTeam === 'red' ? 'blue' : 'red';
  await saveSettings<CNSettings>(NS, code, hostId, {
    ...room.settings, words, revealed: Array(25).fill(false), revealedColors: Array(25).fill(null), turn: startingTeam,
    clueWord: null, clueNumber: null, guessesLeft: 0, winner: null,
    [`${startingTeam}Remaining`]: 9, [`${otherTeam}Remaining`]: 8,
  } as CNSettings);
  await setPhase(NS, code, hostId, 'clue');
}

/** The current team's spymaster gives a clue, this is public info. */
export async function giveClue(code: string, hostId: string, word: string, number: number) {
  const room = await getRoom(code);
  if (!room) return;
  await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, clueWord: word, clueNumber: number, guessesLeft: number + 1 });
  await setPhase(NS, code, hostId, 'guessing');
}

/**
 * An operative taps a word: their client can't resolve its color itself (it
 * doesn't have the key), so it just queues the index on a self-writable
 * path. The host's client reactively picks this up and resolves it, same
 * host-broker pattern every other room mutation in this app uses. The host
 * is allowed to READ the key here via the same blanket "host can read any
 * uid's secret" rule every game already relies on (see secrets.ts), the
 * key still only ever gets WRITTEN to the two spymasters' own paths.
 */
export async function queueGuess(code: string, uid: string, index: number) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), String(index));
}

export async function resolveGuess(code: string, hostId: string, index: number) {
  const room = await getRoom(code);
  if (!room) return;
  const spymasterUid = room.settings.redSpymaster ?? room.settings.blueSpymaster;
  if (!spymasterUid) return;
  const keySnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${spymasterUid}`));
  const { key } = (keySnap.val() as CNKeySecret | null) ?? { key: [] };
  const color = key[index];

  const revealed = [...room.settings.revealed];
  const revealedColors = [...room.settings.revealedColors];
  revealed[index] = true;
  revealedColors[index] = color;

  if (color === 'assassin') {
    const winner = codenamesWinnerOnAssassinTap(room.settings.turn);
    await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, revealed, revealedColors, winner, guessesLeft: 0 });
    await setPhase(NS, code, hostId, 'gameOver');
    return;
  }

  const redRemaining = room.settings.redRemaining - (color === 'red' ? 1 : 0);
  const blueRemaining = room.settings.blueRemaining - (color === 'blue' ? 1 : 0);
  const winner: TeamColor | null = redRemaining === 0 ? 'red' : blueRemaining === 0 ? 'blue' : null;
  const correctForTurn = color === room.settings.turn;
  const guessesLeft = correctForTurn ? room.settings.guessesLeft - 1 : 0;

  if (winner) {
    await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, revealed, revealedColors, redRemaining, blueRemaining, winner, guessesLeft: 0 });
    await setPhase(NS, code, hostId, 'gameOver');
    return;
  }

  if (!correctForTurn || guessesLeft <= 0) {
    const nextTurn: TeamColor = room.settings.turn === 'red' ? 'blue' : 'red';
    await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, revealed, revealedColors, redRemaining, blueRemaining, turn: nextTurn, clueWord: null, clueNumber: null, guessesLeft: 0 });
    await setPhase(NS, code, hostId, 'clue');
    return;
  }

  await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, revealed, revealedColors, redRemaining, blueRemaining, guessesLeft });
}

export async function clearGuessVote(code: string, uid: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), null);
}

export function watchGuessVotes(code: string, cb: (votes: Record<string, string>) => void) {
  return onValue(ref(requireDb(), `${NS}/rooms/${code}/votes`), (snap) => cb((snap.val() as Record<string, string> | null) ?? {}));
}

export async function endTurn(code: string, hostId: string) {
  const room = await getRoom(code);
  if (!room) return;
  const nextTurn: TeamColor = room.settings.turn === 'red' ? 'blue' : 'red';
  await saveSettings<CNSettings>(NS, code, hostId, { ...room.settings, turn: nextTurn, clueWord: null, clueNumber: null, guessesLeft: 0 });
  await setPhase(NS, code, hostId, 'clue');
}

export async function leaveCNRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickCNPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
