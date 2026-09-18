import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, PlayerList, Timer, useToast, QR } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, saveSettings } from '@fb/index';
import {
  createHeadsUpRoom, joinHeadsUpRoom, watchHeadsUpRoom, watchMyWord,
  startGuessing, nextWordSameRound, endRound, backToLobby,
  leaveHeadsUpRoom, type HeadsUpRoom,
} from './firebase';
import { nextGuesser, audienceFor, type Player } from './game';
import { CATEGORIES, nextWord } from './words';
import './heads-up.css';

const CODE_LENGTH = 5;

export default function HeadsUpGame() {
  return <div className="hu"><RequireIdentity>{(id) => <App uid={id.uid} name={id.name} />}</RequireIdentity></div>;
}

function App({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { code: urlCode } = useParams();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<HeadsUpRoom | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const isHost = room?.hostId === uid;

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchHeadsUpRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code) return;
    return watchMyWord(code, uid, (s) => setWord(s?.word ?? null));
  }, [code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try { await createHeadsUpRoom(c, uid, { id: uid, name }); setCode(c); nav(`/heads-up/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  async function joinWithCode(raw: string) {
    const c = raw.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try { await joinHeadsUpRoom(c, { id: uid, name }); setCode(c); nav(`/heads-up/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }

  async function begin() {
    if (!room?.settings) return;
    setError('');
    try {
      const players = Object.values(room.players || {});
      const guesserId = nextGuesser(players, room.settings.guesserId);
      const audience = audienceFor(players, guesserId);
      const w = nextWord(room.settings.category, room.settings.usedWords);
      await startGuessing(code, uid, { ...room.settings, usedWords: [...room.settings.usedWords, w].slice(-40) }, guesserId, audience, w);
    } catch (e) { fail(e); }
  }

  async function tap(correct: boolean) {
    if (!room?.settings) return;
    try {
      const players = Object.values(room.players || {});
      const audience = audienceFor(players, room.settings.guesserId);
      const usedWords = [...room.settings.usedWords, word ?? ''].slice(-40);
      const w = nextWord(room.settings.category, usedWords);
      await nextWordSameRound(code, room.hostId, { ...room.settings, usedWords }, audience, w, room.settings.correctCount + (correct ? 1 : 0));
    } catch (e) { fail(e); }
  }

  function onTimerDone() {
    if (!room?.settings || !isHost) return;
    const guesser = room.players?.[room.settings.guesserId];
    endRound(code, room.hostId, room.settings, room.settings.guesserId, guesser?.score ?? 0).catch(() => {});
  }

  function leave() {
    if (room?.players?.[uid]) leaveHeadsUpRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/heads-up'); setScreen('choose');
  }

  const share = code ? `${location.origin}/housegames/heads-up/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Heads Up</Link>
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Everyone sees it but you</div>
          <h1 className="hg-headline">Heads<em>Up</em></h1>
          <p className="hg-lead">The word's on everyone else's screen. Shout clues until the guesser gets it.</p>
          <div className="actions"><Button onClick={host}>Host a game</Button><Button ghost onClick={() => setScreen('joinForm')}>Join with code</Button></div>
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  if (screen === 'joinForm') {
    return (
      <main>{Header}
        <Card>
          <button className="hg-back" onClick={() => setScreen('choose')}>← Back</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join a room</h2>
          <Field label="Room code"><TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={CODE_LENGTH} /></Field>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join game</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (!room) return <main>{Header}<div className="center">Joining {code}…</div><ErrorText>{error}</ErrorText></main>;

  if (!room.players?.[uid]) {
    return (
      <main>{Header}
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join this round?</h2>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const players: Player[] = Object.values(room.players || {});
  const s = room.settings;

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <Card>
          <div className="room-head"><div className="hg-eyebrow">Room {code}</div>{share && <QR url={share} size={110} />}</div>
          <button className="mini" onClick={() => { navigator.clipboard.writeText(share); toast('Link copied'); }} style={{ marginBottom: 16 }}>Copy link</button>
          <PlayerList players={players.map((p) => ({ ...p, name: `${p.name} · ${p.score ?? 0}pt` }))} hostId={room.hostId} />
          {isHost && (
            <Field label="Category">
              <select value={s?.category} onChange={(e) => saveSettings('headsUp', code, room.hostId, { ...s!, category: e.target.value })} className="hg-input">
                {Object.keys(CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          {isHost && <Button wide disabled={players.length < 3} onClick={begin} style={{ marginTop: 16 }}>Start round</Button>}
          <Button ghost wide onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (room.phase === 'guessing') {
    const isGuesser = s?.guesserId === uid;
    return (
      <main>{Header}
        <section className="center">
          <div className="hg-eyebrow">{s?.category}</div>
          {isGuesser ? (
            <div className="guesser-card">
              <p className="hg-note">Everyone else can see the word — get them to describe it!</p>
              <div className="tap-buttons">
                <Button onClick={() => tap(true)}>✓ Correct</Button>
                <Button ghost onClick={() => tap(false)}>✗ Pass</Button>
              </div>
            </div>
          ) : <div className="word-card">{word ?? '…'}</div>}
          {s?.roundEndsAt && <Timer endsAt={s.roundEndsAt} onDone={onTimerDone} />}
          <p className="hg-note">Correct so far: {s?.correctCount ?? 0}</p>
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  return (
    <main>{Header}
      <section className="center">
        <div className="hg-eyebrow">Round over</div>
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{s?.correctCount ?? 0} correct</h2>
        {isHost && <Button onClick={() => backToLobby(code, room.hostId)} style={{ marginTop: 16 }}>Back to lobby</Button>}
        <Button ghost onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
      </section>
    </main>
  );
}
