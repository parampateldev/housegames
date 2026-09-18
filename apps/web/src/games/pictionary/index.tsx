import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, Field, TextInput, ErrorText, Timer, PlayerList, useToast, RoomHeader, PlayerManager,
} from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import {
  createPictionaryRoom, joinPictionaryRoom, watchPictionaryRoom, advanceSettings,
  setRoundWord, watchMyWord, clearRoundWord, awardPoint, setPictionaryPhase,
  leavePictionaryRoom, kickPlayer, clearStrokes, type PictionaryRoom,
} from './firebase';
import {
  mk, pickWord, nextArtist, checkGuess, type Player, type Settings,
} from './game';
import { Canvas } from './Canvas';
import './pictionary.css';

const CODE_LENGTH = 5;
const DEFAULT_SETTINGS: Settings = { roundSeconds: 60, targetScore: 3, round: 0, artistId: '' };

export default function PictionaryGame() {
  return (
    <div className="pg">
      <RequireIdentity>{(identity) => <PictionaryApp uid={identity.uid} name={identity.name} />}</RequireIdentity>
    </div>
  );
}

function PictionaryApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<PictionaryRoom | null>(null);
  const [error, setError] = useState('');
  const [myWord, setMyWord] = useState<{ word: string; category: string } | null>(null);
  const [guess, setGuess] = useState('');
  const [now, setNow] = useState(Date.now());
  const [roundEndsAt, setRoundEndsAt] = useState(0);

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchPictionaryRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  const round = room?.settings?.round ?? 0;
  const artistId = room?.settings?.artistId ?? '';
  const isArtist = artistId === uid;

  useEffect(() => {
    if (!code || !isArtist || room?.phase !== 'drawing') { setMyWord(null); return; }
    return watchMyWord(code, uid, setMyWord);
  }, [code, isArtist, room?.phase, uid]);

  // A local (phoneless) artist has no device watching their own word, so
  // the host, who already has read access to any player's secret, sees it
  // too and relays it for them.
  const artistHasNoDevice = artistId.startsWith('local-');
  const [localArtistWord, setLocalArtistWord] = useState<{ word: string; category: string } | null>(null);
  useEffect(() => {
    if (!code || !isHost || !artistHasNoDevice || room?.phase !== 'drawing') { setLocalArtistWord(null); return; }
    return watchMyWord(code, artistId, setLocalArtistWord);
  }, [code, isHost, artistHasNoDevice, artistId, room?.phase]);

  useEffect(() => {
    if (room?.phase === 'drawing') setRoundEndsAt(Date.now() + (room.settings.roundSeconds || 60) * 1000);
  }, [room?.phase, round]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createPictionaryRoom(c, uid, mk(uid, name), DEFAULT_SETTINGS);
      setCode(c);
      nav(`/pictionary/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinPictionaryRoom(c, mk(uid, name));
      setCode(c);
      nav(`/pictionary/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leavePictionaryRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/pictionary'); setScreen('choose');
  }

  async function kick(id: string) {
    if (!isHost) return;
    try { await kickPlayer(code, uid, id); } catch (e) { fail(e); }
  }

  async function handOffHost(targetUid: string) {
    try { await makeHost('pictionary', code, uid, targetUid); } catch (e) { fail(e); }
  }

  async function addPhonelessPlayer(playerName: string) {
    try { await addLocalPlayer('pictionary', code, uid, playerName, mk); } catch (e) { fail(e); }
  }

  async function startRound(firstArtistId?: string) {
    if (!room) return;
    setError('');
    try {
      const players = Object.keys(room.players);
      const artist = firstArtistId ?? nextArtist(players, room.settings.artistId || players[0]);
      const { word, category } = pickWord([]);
      const nextSettings: Settings = { ...room.settings, round: (room.settings.round ?? 0) + 1, artistId: artist };
      await advanceSettings(code, uid, nextSettings);
      await setRoundWord(code, artist, { word, category });
      await setPictionaryPhase(code, uid, 'drawing');
    } catch (e) { fail(e); }
  }

  async function markCorrect(guesserId: string) {
    if (!room || !isHost) return;
    setError('');
    try {
      const current = room.players[guesserId]?.score ?? 0;
      await awardPoint(code, guesserId, current + 1);
      await advanceSettings(code, uid, { ...room.settings, lastWord: myWordFallback() });
      await setPictionaryPhase(code, uid, 'roundEnd');
      if (artistId) await clearRoundWord(code, artistId);
    } catch (e) { fail(e); }
  }

  function myWordFallback() {
    return myWord?.word ?? room?.settings?.lastWord ?? '';
  }

  async function endRoundNoWinner() {
    if (!isHost) return;
    try {
      await advanceSettings(code, uid, { ...room!.settings, lastWord: myWordFallback() });
      await setPictionaryPhase(code, uid, 'roundEnd');
      if (artistId) await clearRoundWord(code, artistId);
    } catch (e) { fail(e); }
  }

  function submitGuess() {
    if (!myWord && guess.trim() && room?.phase === 'drawing') {
      // Non-artist guessing: we don't know the word client-side (by design),
      // so just surface it to the host/artist to confirm out loud, this is
      // a casual party game, not an anti-cheat guessing engine.
      toast(`Guessed: "${guess.trim()}"`);
      setGuess('');
    }
  }

  const share = code ? `${location.origin}/housegames/pictionary/${code}` : '';

  if (screen === 'choose') {
    return (
      <main>
        <header style={{ padding: '22px clamp(18px,5vw,72px)' }}>
          <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Pictionary</Link>
        </header>
        <section className="hero">
          <div className="hg-eyebrow">Draw it. No letters, no talking.</div>
          <h1 className="hg-headline">Pictionary</h1>
          <p className="hg-lead">One artist draws, everyone else shouts guesses. Correct guess scores a point.</p>
          <div className="actions" style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Button onClick={host}>Host a game</Button>
            <JoinInline onJoin={joinWithCode} />
          </div>
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  if (!room) {
    return <main><div className="loader">Joining {code}…</div><ErrorText>{error}</ErrorText></main>;
  }

  if (!room.players?.[uid]) {
    return (
      <main>
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join this game?</h2>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const players = Object.values(room.players).filter((p) => p && p.id && p.name);

  if (room.phase === 'lobby') {
    return (
      <main>
        <div className="pg-stage">
          <div className="pg-leave"><Button ghost small onClick={leave}>Leave room</Button></div>
          <RoomHeader gameLabel="Pictionary" code={code} shareUrl={share} />
          <PlayerList players={players} hostId={room.hostId} />
          <PlayerManager
            players={players}
            hostId={room.hostId}
            isHost={isHost}
            onMakeHost={handOffHost}
            onRemove={kick}
            onAddLocal={addPhonelessPlayer}
          />
          {isHost && <Button onClick={() => startRound(uid)} style={{ marginTop: 18 }}>Start drawing</Button>}
          <ErrorText>{error}</ErrorText>
        </div>
      </main>
    );
  }

  if (room.phase === 'drawing') {
    return (
      <main>
        <div className="pg-stage">
          <div className="pg-topbar">
            <span className="hg-eyebrow">Room {code} · Round {round}</span>
            <Timer endsAt={roundEndsAt} onDone={() => { if (isHost) endRoundNoWinner(); }} />
            <Button ghost small onClick={leave}>Leave</Button>
          </div>
          {isArtist && myWord && <div className="pg-word-banner">Draw: {myWord.word}</div>}
          {!isArtist && isHost && artistHasNoDevice && localArtistWord && (
            <div className="pg-word-banner">
              {players.find((p) => p.id === artistId)?.name}'s word (they have no device): {localArtistWord.word}
            </div>
          )}
          {!isArtist && !(isHost && artistHasNoDevice) && (
            <div className="pg-word-banner">{players.find((p) => p.id === artistId)?.name ?? 'Someone'} is drawing...</div>
          )}
          <Canvas code={code} round={round} canDraw={isArtist || (isHost && artistHasNoDevice)} />
          {!isArtist && (
            <div className="pg-guess-row">
              <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Shout it out, then type it here" onKeyDown={(e) => e.key === 'Enter' && submitGuess()} />
              <Button onClick={submitGuess}>Guess</Button>
            </div>
          )}
          {isHost && (
            <details style={{ marginTop: 14 }}>
              <summary>Host: mark who guessed correctly</summary>
              <ul className="pg-scores">
                {players.filter((p) => p.id !== artistId).map((p) => (
                  <li key={p.id}><span>{p.name}</span><button className="hg-btn hg-small" onClick={() => markCorrect(p.id)}>Correct!</button></li>
                ))}
              </ul>
            </details>
          )}
          <ul className="pg-scores">{players.map((p) => <li key={p.id}><span>{p.name}{p.id === artistId ? ' ✏️' : ''}</span><b>{p.score}</b></li>)}</ul>
          <ErrorText>{error}</ErrorText>
        </div>
      </main>
    );
  }

  // roundEnd / finished
  const champion = players.slice().sort((a, b) => b.score - a.score)[0];
  return (
    <main>
      <div className="pg-stage">
        <div className="pg-round-end">
          <div className="hg-eyebrow">Room {code}</div>
          <h2>Round over</h2>
          <div className="word">{room.settings.lastWord}</div>
          <p>{champion?.name} leads with {champion?.score ?? 0} point(s)</p>
        </div>
        <ul className="pg-scores" style={{ marginTop: 18 }}>{players.map((p) => <li key={p.id}><span>{p.name}</span><b>{p.score}</b></li>)}</ul>
        {isHost && (
          <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
            <Button onClick={() => { clearStrokes(code, round).catch(() => {}); startRound(); }}>Next artist</Button>
            <Button ghost onClick={leave}>End game</Button>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </main>
  );
}

function JoinInline({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Room code" maxLength={CODE_LENGTH} />
      <Button ghost onClick={() => onJoin(code)}>Join</Button>
    </div>
  );
}
