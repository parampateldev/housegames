import {
  createRoom, joinRoom, watchRoom, setPhase, saveSettings, updatePlayer, removePlayer, leaveRoom,
  setSecret, clearSecret, watchMySecret,
  db, type BaseRoom, type BasePlayer,
} from '@fb/index';
import { get, ref, set, onValue } from 'firebase/database';
import {
  assignSecretHitlerRoles, buildPolicyDeck, drawCards, tallySHVote, checkSHWinner, nextPresident,
  type Role, type Policy,
} from './game';

const NS = 'secretHitler';
// A fixed, non-uid key: the rules only grant read/write here via the
// hostOnly branch (no real auth.uid will ever equal the literal string
// "_deck"), so the deck stays host-authoritative across host migration too.
const DECK_KEY = '_deck';

export type SHPlayer = BasePlayer & { alive: boolean };
export type SHPhase = 'lobby' | 'nominate' | 'vote' | 'legislativePresident' | 'legislativeChancellor' | 'gameOver';
export type SHSettings = {
  playerOrder: string[];
  presidentId: string;
  chancellorNomineeId: string | null;
  chancellorId: string | null;
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  lastEnacted: Policy | null;
  winner: 'liberal' | 'fascist' | null;
};
export type SHRoom = BaseRoom<SHSettings, SHPlayer> & { phase: SHPhase };
export type SHRoleSecret = { role: Role; teammates: string[] };

function requireDb() {
  if (!db) throw new Error('Firebase is not configured');
  return db;
}
async function getRoom(code: string): Promise<SHRoom | null> {
  const snap = await get(ref(requireDb(), `${NS}/rooms/${code}`));
  return snap.val() as SHRoom | null;
}

export async function createSHRoom(code: string, hostId: string, hostName: string) {
  await createRoom<SHSettings, SHPlayer>(NS, code, hostId, { id: hostId, name: hostName, alive: true }, {
    playerOrder: [], presidentId: '', chancellorNomineeId: null, chancellorId: null,
    liberalPolicies: 0, fascistPolicies: 0, electionTracker: 0, lastEnacted: null, winner: null,
  });
}

export async function joinSHRoom(code: string, uid: string, name: string) {
  await joinRoom<SHPlayer>(NS, code, { id: uid, name, alive: true });
}

export function watchSHRoom(code: string, cb: (r: SHRoom | null) => void, onError?: (m: string) => void) {
  return watchRoom<SHRoom>(NS, code, cb, onError);
}

export function watchMyRole(code: string, uid: string, cb: (secret: SHRoleSecret | null) => void) {
  return watchMySecret<SHRoleSecret>(NS, code, uid, cb);
}
export function watchMyDraw(code: string, uid: string, cb: (secret: { cards: Policy[] } | null) => void) {
  return watchMySecret<{ cards: Policy[] }>(NS, code, uid, cb);
}

/** Host-only: assigns roles, builds the deck, and starts the first round. */
export async function startGame(code: string, hostId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can start');
  const playerIds = Object.keys(room.players ?? {});
  if (playerIds.length < 5 || playerIds.length > 10) throw new Error('Secret Hitler needs 5-10 players');

  const { roles, teamSeenBy } = assignSecretHitlerRoles(playerIds);
  await Promise.all(playerIds.map((uid) => setSecret<SHRoleSecret>(NS, code, uid, {
    role: roles[uid],
    teammates: (teamSeenBy[uid] ?? []).map((id) => room.players[id]?.name).filter(Boolean) as string[],
  })));

  const deck = buildPolicyDeck();
  await setSecret(NS, code, DECK_KEY, { deck, drawIndex: 0 });

  const order = [...playerIds].sort(() => Math.random() - 0.5);
  await saveSettings<SHSettings>(NS, code, hostId, {
    playerOrder: order, presidentId: order[0], chancellorNomineeId: null, chancellorId: null,
    liberalPolicies: 0, fascistPolicies: 0, electionTracker: 0, lastEnacted: null, winner: null,
  });
  await setPhase(NS, code, hostId, 'nominate');
}

export async function nominateChancellor(code: string, hostId: string, nomineeId: string) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can advance nomination');
  await saveSettings<SHSettings>(NS, code, hostId, { ...room.settings, chancellorNomineeId: nomineeId });
  await setPhase(NS, code, hostId, 'vote');
}

/**
 * Reused across three different moments (ja/nein vote, president's nominee
 * pick, president/chancellor's discard index) since all three are just "one
 * player writes one string to their own uid, host reacts to it", same
 * shape, same rule (`votes/$uid` is self-writable), no reason for three
 * separate paths.
 */
export async function submitChoice(code: string, uid: string, value: string) {
  await set(ref(requireDb(), `${NS}/rooms/${code}/votes/${uid}`), value);
}
export const castVote = submitChoice;

export function watchVotes(code: string, cb: (votes: Record<string, string>) => void) {
  return onValue(ref(requireDb(), `${NS}/rooms/${code}/votes`), (snap) => cb((snap.val() as Record<string, string> | null) ?? {}));
}

/** Host-only: clears specific voters' entries (each has its own host-writable rule; there's no single rule for the whole `votes` node). */
export async function clearVotes(code: string, uids: string[]) {
  const { update } = await import('firebase/database');
  const patch: Record<string, null> = {};
  for (const uid of uids) patch[`${NS}/rooms/${code}/votes/${uid}`] = null;
  await update(ref(requireDb()), patch);
}

/** Host-only: tallies the vote (call once every alive player has voted) and advances the round. */
export async function resolveVote(code: string, hostId: string, votes: Record<string, 'ja' | 'nein'>) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can resolve the vote');
  const { passed } = tallySHVote(votes);

  if (!passed) {
    const tracker = room.settings.electionTracker + 1;
    if (tracker >= 3) {
      const deckSnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${DECK_KEY}`));
      const { deck, drawIndex } = (deckSnap.val() as { deck: Policy[]; drawIndex: number }) ?? { deck: buildPolicyDeck(), drawIndex: 0 };
      const { cards, nextDeck, nextDrawIndex } = drawCards(deck, drawIndex, 1);
      await setSecret(NS, code, DECK_KEY, { deck: nextDeck, drawIndex: nextDrawIndex });
      const forced = cards[0];
      const nextLiberal = room.settings.liberalPolicies + (forced === 'liberal' ? 1 : 0);
      const nextFascist = room.settings.fascistPolicies + (forced === 'fascist' ? 1 : 0);
      const winner = checkSHWinner({ liberalPolicies: nextLiberal, fascistPolicies: nextFascist, chancellorId: null, roles: {} });
      const nextPres = nextPresident(room.settings.playerOrder, room.settings.presidentId);
      await saveSettings<SHSettings>(NS, code, hostId, {
        ...room.settings, electionTracker: 0, liberalPolicies: nextLiberal, fascistPolicies: nextFascist,
        lastEnacted: forced, winner, presidentId: nextPres, chancellorNomineeId: null,
      });
      await setPhase(NS, code, hostId, winner ? 'gameOver' : 'nominate');
      return;
    }
    const nextPres = nextPresident(room.settings.playerOrder, room.settings.presidentId);
    await saveSettings<SHSettings>(NS, code, hostId, { ...room.settings, electionTracker: tracker, presidentId: nextPres, chancellorNomineeId: null });
    await setPhase(NS, code, hostId, 'nominate');
    return;
  }

  const deckSnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${DECK_KEY}`));
  const { deck, drawIndex } = (deckSnap.val() as { deck: Policy[]; drawIndex: number }) ?? { deck: buildPolicyDeck(), drawIndex: 0 };
  const { cards, nextDeck, nextDrawIndex } = drawCards(deck, drawIndex, 3);
  await setSecret(NS, code, DECK_KEY, { deck: nextDeck, drawIndex: nextDrawIndex });
  await setSecret(NS, code, room.settings.chancellorNomineeId!, { cards });
  await saveSettings<SHSettings>(NS, code, hostId, { ...room.settings, chancellorId: room.settings.chancellorNomineeId, electionTracker: 0 });
  await setPhase(NS, code, hostId, 'legislativePresident');
}

/** President discards one of their 3 cards; the other 2 go to the chancellor. Host-brokered. */
export async function presidentDiscard(code: string, hostId: string, presidentId: string, discardIndex: number) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can broker the discard');
  const drawSnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${presidentId}`));
  const { cards } = (drawSnap.val() as { cards: Policy[] }) ?? { cards: [] };
  const remaining = cards.filter((_, i) => i !== discardIndex);
  await clearSecret(NS, code, presidentId);
  await setSecret(NS, code, room.settings.chancellorId!, { cards: remaining });
  await setPhase(NS, code, hostId, 'legislativeChancellor');
}

/** Chancellor discards one of their 2 cards; the last is enacted. Host-brokered. */
export async function chancellorDiscard(code: string, hostId: string, chancellorId: string, discardIndex: number) {
  const room = await getRoom(code);
  if (room?.hostId !== hostId) throw new Error('Only the host can broker the enactment');
  const drawSnap = await get(ref(requireDb(), `${NS}/secrets/${code}/${chancellorId}`));
  const { cards } = (drawSnap.val() as { cards: Policy[] }) ?? { cards: [] };
  const enacted = cards.filter((_, i) => i !== discardIndex)[0];
  await clearSecret(NS, code, chancellorId);

  const nextLiberal = room.settings.liberalPolicies + (enacted === 'liberal' ? 1 : 0);
  const nextFascist = room.settings.fascistPolicies + (enacted === 'fascist' ? 1 : 0);

  const roleSnaps = await Promise.all(Object.keys(room.players).map((uid) => get(ref(requireDb(), `${NS}/secrets/${code}/${uid}`))));
  const roles: Record<string, Role> = {};
  Object.keys(room.players).forEach((uid, i) => { const v = roleSnaps[i].val() as SHRoleSecret | null; if (v) roles[uid] = v.role; });

  const winner = checkSHWinner({ liberalPolicies: nextLiberal, fascistPolicies: nextFascist, chancellorId, roles });
  const nextPres = nextPresident(room.settings.playerOrder, room.settings.presidentId);
  await saveSettings<SHSettings>(NS, code, hostId, {
    ...room.settings, liberalPolicies: nextLiberal, fascistPolicies: nextFascist, lastEnacted: enacted,
    winner, presidentId: nextPres, chancellorNomineeId: null,
  });
  await setPhase(NS, code, hostId, winner ? 'gameOver' : 'nominate');
}

export async function leaveSHRoom(code: string, uid: string) {
  await leaveRoom(NS, code, uid, [`${NS}/secrets/${code}/${uid}`]);
}
export async function kickSHPlayer(code: string, hostId: string, targetUid: string) {
  await removePlayer(NS, code, hostId, targetUid);
}
