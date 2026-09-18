import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, removePlayer, leaveRoom,
  setSecret, watchMySecret, getAllSecretsOnce,
  db, type BaseRoom, type BasePlayer,
} from '@fb/index';
import { get, ref, set, onValue } from 'firebase/database';
import { shuffle, drawCards, dealHands, nextCzar, anonymizeSubmissions } from './game';
import { BLACK_CARDS, WHITE_CARDS } from './cards';

const NS = 'cah';
const DECK_KEY = '_deck'; // host-only fixed key, same trick as Secret Hitler's deck, survives host migration

export type CAHPlayer = BasePlayer & { score: number };
export type CAHPhase = 'lobby' | 'submitting' | 'judging' | 'roundResult' | 'gameOver';
export type Reveal = { uid: string; card: string; name: string };
export type CAHSettings = {
  order: string[];
  czarId: string;
  blackCard: string;
  submittedCount: number;
  lastWinner: { name: string; card: string } | null;
  reveals: Reveal[];
};
export type CAHRoom = BaseRoom<CAHSettings, CAHPlayer> & { phase: CAHPhase };
export type CAHHandSecret = { hand: string[]; submission: string | null };
export type CAHJudgeSecret = { order: string[]; cards: string[] };

function requireDb() { if (!db) throw new Error('Firebase is not configured'); return db; }
async function getRoom(code: string): Promise<CAHRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as CAHRoom | null;
}
async function getDeck(code: string): Promise<{ black: string[]; blackIdx: number; white: string[]; whiteIdx: number }> {
  const snap = await get(ref(requireDb(), `${NS}/secrets/${code}/${DECK_KEY}`));
  return (snap.val() as { black: string[]; blackIdx: number; white: string[]; whiteIdx: number } | null)
    ?? { black: shuffle(BLACK_CARDS), blackIdx: 0, white: shuffle(WHITE_CARDS), whiteIdx: 0 };
}

export async function createCAHRoom(code: string, hostId: string, hostName: string) {
  await createRoom<CAHSettings, CAHPlayer>(NS, code, hostId, { id: hostId, name: hostName, score: 0 }, {
    order: [], czarId: '', blackCard: '', submittedCount: 0, lastWinner: null, reveals: [],
  });
}
export async function joinCAHRoom(code: string, uid: string, name: string) {
  await joinRoom<CAHPlayer>(NS, code, { id: uid, name, score: 0 });
}
export function watchCAHRoom(code: string, cb: (r: CAHRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<CAHRoom>(NS, code, cb, onError);
}
export function watchMyHand(code: string, uid: string, cb: (s: CAHHandSecret | null) => void) {
  return watchMySecret<CAHHandSecret>(NS, code, uid, cb);
}
export function watchJudging(code: string, uid: string, cb: (s: CAHJudgeSecret | null) => void) {
  return watchMySecret<CAHJudgeSecret>(NS, code, uid, cb);
}

export async function startCAHGame(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const playerIds = Object.keys(room.players ?? {});
  if (playerIds.length < 3) throw new Error('Cards Against Humanity needs at least 3 players');

  const white = shuffle(WHITE_CARDS);
  const black = shuffle(BLACK_CARDS);
  const { hands, nextDeck, nextDrawIndex } = dealHands(white, playerIds, 7);
  await set(ref(requireDb(), `${NS}/secrets/${code}/${DECK_KEY}`), { black, blackIdx: 1, white: nextDeck, whiteIdx: nextDrawIndex });
  await Promise.all(playerIds.map((uid) => setSecret<CAHHandSecret>(NS, code, uid, { hand: hands[uid], submission: null })));

  const order = shuffle(playerIds);
  await saveSettings<CAHSettings>(NS, code, hostId, {
    order, czarId: order[0], blackCard: black[0], submittedCount: 0, lastWinner: null, reveals: [],
  });
  await setPhase(NS, code, hostId, 'submitting');
}

/** A non-czar player submits one card from their hand (by index), self-write to their own secret. */
export async function submitCard(code: string, uid: string, hand: string[], cardIndex: number) {
  await setSecret<CAHHandSecret>(NS, code, uid, { hand, submission: hand[cardIndex] });
}

/** Host-only: once everyone but the czar has submitted, anonymize and hand the pile to the czar. */
export async function beginJudging(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can begin judging');
  const nonCzar = Object.keys(room.players).filter((id) => id !== room.settings.czarId);
  const hands = await getAllSecretsOnce<CAHHandSecret>(NS, code, nonCzar);
  const submissions: Record<string, string> = {};
  for (const [uid, h] of Object.entries(hands)) if (h.submission) submissions[uid] = h.submission;
  const { order, cards } = anonymizeSubmissions(submissions);
  await setSecret<CAHJudgeSecret>(NS, code, room.settings.czarId, { order, cards });
  await setPhase(NS, code, hostId, 'judging');
}

/** The czar picks a winning index, self-write, host resolves it. */
export async function pickWinner(code: string, uid: string, chosenIndex: number) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), String(chosenIndex));
}

export function watchVotes(code: string, cb: (votes: Record<string, string>) => void) {
  return onValue(ref(requireDb(), `${NS}/rooms/${code}/votes`), (snap) => cb((snap.val() as Record<string, string> | null) ?? {}));
}
export async function clearVote(code: string, uid: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), null);
}

/** Host-only: resolves the czar's pick, awards the point, reveals attribution, refills hands, rotates czar. */
export async function resolveWinner(code: string, hostId: string, chosenIndex: number) {
  const room = await getRoom(code);
  if (!room) return;
  const judgeSnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${room.settings.czarId}`));
  const { order, cards } = (judgeSnap.val() as CAHJudgeSecret | null) ?? { order: [], cards: [] };
  const winnerUid = order[chosenIndex];
  const winningCard = cards[chosenIndex];
  if (!winnerUid) return;

  const reveals: Reveal[] = order.map((uid, i) => ({ uid, card: cards[i], name: room.players[uid]?.name ?? '?' }));
  const players = { ...room.players };
  if (players[winnerUid]) players[winnerUid] = { ...players[winnerUid], score: players[winnerUid].score + 1 };
  await Promise.all(Object.values(players).map((p) => set(ref(requireDb(), `${NS}/rooms/${code}/players/${p.id}/score`), p.score)));

  await saveSettings<CAHSettings>(NS, code, hostId, {
    ...room.settings, lastWinner: { name: players[winnerUid]?.name ?? '?', card: winningCard }, reveals,
  });
  await setPhase(NS, code, hostId, 'roundResult');
}

/** Host-only: deals a fresh black card + refills hands (drawing only what each player used), rotates czar. */
export async function nextRound(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) return;
  const deck = await getDeck(code);
  const { cards: [blackCard], nextDeck: nextBlack, nextDrawIndex: nextBlackIdx } = drawCards(deck.black, deck.blackIdx, 1, BLACK_CARDS);

  const playerIds = Object.keys(room.players);
  const hands = await getAllSecretsOnce<CAHHandSecret>(NS, code, playerIds);
  let whiteDeck = deck.white;
  let whiteIdx = deck.whiteIdx;
  for (const uid of playerIds) {
    const current = hands[uid]?.hand ?? [];
    const need = 7 - current.length;
    if (need <= 0) continue;
    const { cards, nextDeck, nextDrawIndex } = drawCards(whiteDeck, whiteIdx, need, WHITE_CARDS);
    whiteDeck = nextDeck; whiteIdx = nextDrawIndex;
    await setSecret<CAHHandSecret>(NS, code, uid, { hand: [...current, ...cards], submission: null });
  }
  await set(ref(requireDb(), `${NS}/secrets/${code}/${DECK_KEY}`), { black: nextBlack, blackIdx: nextBlackIdx, white: whiteDeck, whiteIdx });

  const czarId = nextCzar(room.settings.order, room.settings.czarId);
  await saveSettings<CAHSettings>(NS, code, hostId, { ...room.settings, czarId, blackCard, submittedCount: 0, lastWinner: null, reveals: [] });
  await setPhase(NS, code, hostId, 'submitting');
}

export async function leaveCAHRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickCAHPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
