import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, PlayerList, useToast, QR } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode } from '@fb/index';
import {
  createWavelengthRoom, joinWavelengthRoom, watchWavelengthRoom, watchMyTarget,
  startRound, submitClue, submitTeamGuess, submitOpponentCall, revealTarget, finishRound, setTeam,
  leaveWavelengthRoom, kickWavelengthPlayer, type WavelengthRoom,
} from './firebase';
import { scoreGuess, opponentCallCorrect, nextPsychic, type Player } from './game';
import { SPECTRUMS } from './prompts';
import './wavelength.css';

const CODE_LENGTH = 5;

export default function WavelengthGame() {
  return <div className="wl"><RequireIdentity>{(id) => <App uid={id.uid} name={id.name} />}</RequireIdentity></div>;
}

function App({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { code: urlCode } = useParams();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<WavelengthRoom | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [clueDraft, setClueDraft] = useState('');
  const [guess, setGuess] = useState(50);
  const [error, setError] = useState('');
  const [revealedTarget, setRevealedTarget] = useState<number | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const isHost = room?.hostId === uid;

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchWavelengthRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code) return;
    return watchMyTarget(code, uid, (s) => setTarget(s?.target ?? null));
  }, [code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createWavelengthRoom(c, uid, { id: uid, name });
      setCode(c); nav(`/wavelength/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(raw: string) {
    const c = raw.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinWavelengthRoom(c, { id: uid, name, team: 'B' });
      setCode(c); nav(`/wavelength/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function beginRound() {
    if (!room) return;
    setError('');
    try {
      const [left, right] = SPECTRUMS[Math.floor(Math.random() * SPECTRUMS.length)];
      const t = Math.floor(Math.random() * 101);
      const nextTeam = room.settings?.team === 'A' ? 'B' : 'A';
      const psychicId = nextPsychic(Object.values(room.players || {}), nextTeam, room.settings?.psychicId ?? '');
      await startRound(code, uid, psychicId || uid, nextTeam, left, right, t, room.settings?.scoreA ?? 0, room.settings?.scoreB ?? 0);
    } catch (e) { fail(e); }
  }

  async function sendClue() {
    if (!room?.settings || !clueDraft.trim()) return;
    try { await submitClue(code, room.hostId, room.settings, clueDraft.trim()); setClueDraft(''); } catch (e) { fail(e); }
  }

  async function sendGuess() {
    if (!room?.settings) return;
    try { await submitTeamGuess(code, room.hostId, room.settings, guess); } catch (e) { fail(e); }
  }

  async function sendCall(call: 'left' | 'right') {
    if (!room?.settings) return;
    try { await submitOpponentCall(code, room.hostId, room.settings, call); } catch (e) { fail(e); }
  }

  useEffect(() => {
    if (room?.phase !== 'reveal' || !room.settings?.psychicId || revealedTarget !== null) return;
    revealTarget(code, room.settings.psychicId).then(setRevealedTarget).catch(() => {});
  }, [room?.phase, room?.settings?.psychicId, code, revealedTarget]);

  async function finish() {
    if (!room?.settings || revealedTarget === null || room.settings.teamGuess === undefined) return;
    const pts = scoreGuess(revealedTarget, room.settings.teamGuess);
    const bonus = room.settings.opponentCall && opponentCallCorrect(revealedTarget, room.settings.teamGuess, room.settings.opponentCall) ? 1 : 0;
    const scoreA = room.settings.scoreA + (room.settings.team === 'A' ? pts + bonus : 0);
    const scoreB = room.settings.scoreB + (room.settings.team === 'B' ? pts + bonus : 0);
    setRevealedTarget(null);
    try { await finishRound(code, room.hostId, { ...room.settings, scoreA, scoreB, clue: undefined, teamGuess: undefined, opponentCall: undefined }); } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leaveWavelengthRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/wavelength'); setScreen('choose');
  }

  const share = code ? `${location.origin}/housegames/wavelength/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Wavelength</Link>
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Read each other's minds</div>
          <h1 className="hg-headline">Wave<em>length</em></h1>
          <p className="hg-lead">One of you sees a hidden target on a spectrum. Give a clue. Guess where it lands.</p>
          <div className="actions">
            <Button onClick={host}>Host a game</Button>
            <Button ghost onClick={() => setScreen('joinForm')}>Join with code</Button>
          </div>
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
          <div className="scoreboard"><span>Team A: {s?.scoreA ?? 0}</span><span>Team B: {s?.scoreB ?? 0}</span></div>
          <PlayerList players={players.map((p) => ({ ...p, name: `${p.name} (${p.team ?? '-'})` }))} hostId={room.hostId} />
          <div className="actions">
            <Button onClick={() => setTeam(code, uid, 'A')}>Join Team A</Button>
            <Button onClick={() => setTeam(code, uid, 'B')}>Join Team B</Button>
          </div>
          {isHost && <Button wide onClick={beginRound} style={{ marginTop: 16 }}>Start round</Button>}
          <Button ghost wide onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const isPsychic = s?.psychicId === uid;

  if (room.phase === 'psychicSees' || room.phase === 'clueGiven') {
    return (
      <main>{Header}
        <section style={{ padding: '2vh clamp(18px,5vw,72px)' }}>
          <div className="spectrum"><span>{s?.spectrumLeft}</span><span>{s?.spectrumRight}</span></div>
          <div className="dial">
            {isPsychic && target !== null && <div className="marker target" style={{ left: `${target}%` }} />}
          </div>
          {isPsychic ? (
            room.phase === 'psychicSees' ? (
              <>
                <p className="hg-note">Only you can see the target. Give your team a one-word clue.</p>
                <Field label="Your clue"><TextInput value={clueDraft} onChange={(e) => setClueDraft(e.target.value)} /></Field>
                <Button wide onClick={sendClue} style={{ marginTop: 12 }}>Lock in clue</Button>
              </>
            ) : <p className="hg-note">Waiting for your team to guess…</p>
          ) : (
            room.phase === 'clueGiven'
              ? <p className="hg-note">Clue: <b>{s?.clue}</b>, your team is guessing.</p>
              : <p className="hg-note">The psychic is thinking of a clue…</p>
          )}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  if (room.phase === 'teamGuess') {
    const onGuessingTeam = players.find((p) => p.id === uid)?.team === s?.team && !isPsychic;
    return (
      <main>{Header}
        <section style={{ padding: '2vh clamp(18px,5vw,72px)' }}>
          <div className="spectrum"><span>{s?.spectrumLeft}</span><span>{s?.spectrumRight}</span></div>
          <p className="hg-note">Clue: <b>{s?.clue}</b></p>
          {onGuessingTeam ? (
            <>
              <div className="dial"><input type="range" min={0} max={100} value={guess} onChange={(e) => setGuess(+e.target.value)} /></div>
              <Button wide onClick={sendGuess}>Lock in guess ({guess})</Button>
            </>
          ) : <p className="hg-note">Waiting on the guessing team…</p>}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  if (room.phase === 'opponentCall') {
    const onOtherTeam = players.find((p) => p.id === uid)?.team !== s?.team;
    return (
      <main>{Header}
        <section style={{ padding: '2vh clamp(18px,5vw,72px)' }}>
          <p className="hg-note">Team {s?.team} guessed {s?.teamGuess}. Was the real target left or right of that?</p>
          {onOtherTeam ? (
            <div className="actions"><Button onClick={() => sendCall('left')}>Left</Button><Button onClick={() => sendCall('right')}>Right</Button></div>
          ) : <p className="hg-note">Waiting on the other team's call…</p>}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  // reveal
  return (
    <main>{Header}
      <section className="center">
        <div className="spectrum"><span>{s?.spectrumLeft}</span><span>{s?.spectrumRight}</span></div>
        <div className="dial">
          {revealedTarget !== null && <div className="marker target" style={{ left: `${revealedTarget}%` }} />}
          {s?.teamGuess !== undefined && <div className="marker guess" style={{ left: `${s.teamGuess}%` }} />}
        </div>
        <p className="hg-note">Target was {revealedTarget ?? '…'}, team guessed {s?.teamGuess}.</p>
        {isHost && <Button onClick={finish} style={{ marginTop: 16 }}>Next round</Button>}
        <Button ghost onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
      </section>
    </main>
  );
}
