import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, useToast } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, db } from '@fb/index';
import { set, ref } from 'firebase/database';
import {
  createCAHRoom, joinCAHRoom, watchCAHRoom, startCAHGame, submitCard, beginJudging, pickWinner,
  watchVotes, clearVote, resolveWinner, nextRound, leaveCAHRoom, watchMyHand, watchJudging,
  type CAHRoom, type CAHHandSecret, type CAHJudgeSecret,
} from './firebase';
import './cah.css';

const CODE_LENGTH = 5;

export default function CAHGame() {
  return (
    <div className="cah">
      <RequireIdentity>{(identity) => <CAHApp uid={identity.uid} name={identity.name} />}</RequireIdentity>
    </div>
  );
}

function CAHApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<CAHRoom | null>(null);
  const [error, setError] = useState('');
  const [hand, setHand] = useState<CAHHandSecret | null>(null);
  const [judging, setJudging] = useState<CAHJudgeSecret | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});

  const isHost = room?.hostId === uid;
  const isCzar = room?.settings.czarId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchCAHRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => { if (code) return watchMyHand(code, uid, setHand); }, [code, uid, room?.phase]);
  useEffect(() => { if (code) return watchJudging(code, uid, setJudging); }, [code, uid, room?.phase]);
  useEffect(() => { if (code) return watchVotes(code, setVotes); }, [code]);

  // Every player marks a public "submitted" flag via votes/$uid = '1' so the host can tell when everyone's in without reading secrets reactively.
  useEffect(() => {
    if (!isHost || !room || room.phase !== 'submitting') return;
    const nonCzar = Object.keys(room.players).filter((id) => id !== room.settings.czarId);
    if (nonCzar.length > 0 && nonCzar.every((id) => votes[id] === '1')) {
      Promise.all(nonCzar.map((id) => clearVote(code, id))).then(() => beginJudging(code, uid)).catch(() => {});
    }
  }, [isHost, room, votes, code, uid]);

  // Host resolves the czar's pick once cast.
  useEffect(() => {
    if (!isHost || !room || room.phase !== 'judging') return;
    const pick = votes[room.settings.czarId];
    if (pick === undefined) return;
    clearVote(code, room.settings.czarId).then(() => resolveWinner(code, uid, Number(pick))).catch(() => {});
  }, [isHost, room, votes, code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try { await createCAHRoom(c, uid, name); setCode(c); nav(`/cards-against-humanity/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError("That room code doesn't look right");
    setError('');
    try { await joinCAHRoom(c, uid, name); setCode(c); nav(`/cards-against-humanity/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  function leave() {
    if (room?.players?.[uid]) leaveCAHRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/cards-against-humanity'); setScreen('choose');
  }

  async function pickCard(index: number) {
    if (!hand || !db) return;
    try {
      await submitCard(code, uid, hand.hand, index);
      await set(ref(db, `cah/rooms/${code}/votes/${uid}`), '1');
    } catch (e) { fail(e); }
  }

  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Cards Against Humanity</Link>
      {code && <Button small ghost onClick={leave}>Leave</Button>}
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Fill in the blank. The Card Czar decides.</div>
          <h1 className="hg-headline">Cards Against<br /><em>Humanity.</em></h1>
          <p className="hg-lead">Original prompts and answers, written for this table. 3+ players.</p>
          <div className="actions">
            <Button onClick={host}>Host a game</Button>
            <Button ghost onClick={() => setScreen('joinForm')}>Join with code</Button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'joinForm') {
    return (
      <main>{Header}
        <Card>
          <button className="hg-back" onClick={() => setScreen('choose')}>← Back</button>
          <h2>Join a room</h2>
          <Field label="Room code"><TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={CODE_LENGTH} /></Field>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join game</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (!room) return <main>{Header}<div className="loader">Joining {code}…</div><ErrorText>{error}</ErrorText></main>;

  if (!room.players?.[uid]) {
    return (
      <main>{Header}
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2>Join this game?</h2>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const players = Object.values(room.players || {});

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2>Lobby</h2>
          <div className="scoreboard">{players.map((p) => <div key={p.id} className="row"><span>{p.name}{p.id === room.hostId ? ' 👑' : ''}</span><span>{p.score}</span></div>)}</div>
          {isHost ? (
            <Button wide disabled={players.length < 3} onClick={() => startCAHGame(code, uid).catch(fail)} style={{ marginTop: 12 }}>
              {players.length < 3 ? `Need ${3 - players.length} more` : 'Start game'}
            </Button>
          ) : <p className="hg-note">Waiting for the host to start (3+ players)…</p>}
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const czar = players.find((p) => p.id === room.settings.czarId);
  const iSubmitted = hand?.submission != null;

  return (
    <main>{Header}
      <section style={{ maxWidth: 700, margin: '4vh auto', padding: '0 18px' }}>
        <div className="hg-eyebrow">Room {code} · Czar: {czar?.name}</div>
        <div className="black-card">{room.settings.blackCard}</div>

        {room.phase === 'submitting' && (
          isCzar ? <p className="hg-note">You're the Czar this round — sit tight while everyone picks a card.</p> :
          iSubmitted ? <p className="hg-note">Card submitted. Waiting on others…</p> : (
            <div className="hand">
              {hand?.hand.map((card, i) => (
                <button key={i} className="white-card" onClick={() => pickCard(i)}>{card}</button>
              ))}
            </div>
          )
        )}

        {room.phase === 'judging' && (
          isCzar && judging ? (
            <div className="hand">
              {judging.cards.map((card, i) => (
                <button key={i} className="white-card" onClick={() => pickWinner(code, uid, i).catch(fail)}>{card}</button>
              ))}
            </div>
          ) : <p className="hg-note">{czar?.name} is judging…</p>
        )}

        {room.phase === 'roundResult' && (
          <Card>
            <h3>{room.settings.lastWinner?.name} wins the round!</h3>
            <p className="hg-note">"{room.settings.lastWinner?.card}"</p>
            <details style={{ margin: '10px 0' }}>
              <summary>Who played what</summary>
              {room.settings.reveals.map((r) => <div key={r.uid} className="hg-note">{r.name}: {r.card}</div>)}
            </details>
            {isHost && <Button onClick={() => nextRound(code, uid).catch(fail)}>Next round</Button>}
          </Card>
        )}

        <div className="scoreboard" style={{ marginTop: 20 }}>{players.map((p) => <div key={p.id} className="row"><span>{p.name}{p.id === room.settings.czarId ? ' 🎩' : ''}</span><span>{p.score}</span></div>)}</div>
        <ErrorText>{error}</ErrorText>
      </section>
    </main>
  );
}
