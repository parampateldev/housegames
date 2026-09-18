import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, PlayerList, Timer, RoomHeader, PlayerManager, HelpModal, useToast } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, saveSettings, makeHost, addLocalPlayer } from '@fb/index';
import {
  createCharadesRoom, joinCharadesRoom, watchCharadesRoom, watchMyWord,
  startActing, markCorrect, endRound, backToLobby, setTeam,
  leaveCharadesRoom, kickCharadesPlayer, type CharadesRoom,
} from './firebase';
import { nextActor, type Player } from './game';
import { CATEGORIES, pickWord } from './words';
import './charades.css';

const CODE_LENGTH = 5;

export default function CharadesGame() {
  return <div className="cg"><RequireIdentity>{(id) => <App uid={id.uid} name={id.name} />}</RequireIdentity></div>;
}

function App({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { code: urlCode } = useParams();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<CharadesRoom | null>(null);
  const [word, setWord] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const isHost = room?.hostId === uid;
  const actorId = room?.settings?.actorId ?? '';
  const actorHasNoDevice = actorId.startsWith('local-');
  const [localActorWord, setLocalActorWord] = useState<string | null>(null);

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchCharadesRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code) return;
    return watchMyWord(code, uid, (s) => setWord(s?.word ?? null));
  }, [code, uid]);

  // A local (phoneless) actor has no device to see their own word, so the
  // host, who already has read access to any player's secret, sees it too
  // and relays it for them.
  useEffect(() => {
    if (!code || !isHost || !actorHasNoDevice || room?.phase !== 'acting') { setLocalActorWord(null); return; }
    return watchMyWord(code, actorId, (s) => setLocalActorWord(s?.word ?? null));
  }, [code, isHost, actorHasNoDevice, actorId, room?.phase]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try { await createCharadesRoom(c, uid, { id: uid, name }); setCode(c); nav(`/charades/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  async function joinWithCode(raw: string) {
    const c = raw.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try { await joinCharadesRoom(c, { id: uid, name, team: 'B' }); setCode(c); nav(`/charades/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }

  async function begin() {
    if (!room?.settings) return;
    setError('');
    try {
      const nextTeam = room.settings.team === 'A' ? 'B' : 'A';
      const actorId = nextActor(Object.values(room.players || {}), nextTeam, room.settings.actorId);
      const w = pickWord(room.settings.category, room.settings.usedWords);
      await startActing(code, uid, { ...room.settings, usedWords: [...room.settings.usedWords, w].slice(-40) }, actorId || uid, w);
    } catch (e) { fail(e); }
  }

  async function correct() {
    if (!room?.settings) return;
    const actor = room.players?.[room.settings.actorId];
    try { await markCorrect(code, room.hostId, room.settings, room.settings.actorId, actor?.score ?? 0); } catch (e) { fail(e); }
  }

  function onTimerDone() {
    if (!room?.settings || !isHost) return;
    endRound(code, room.hostId, room.settings).catch(() => {});
  }

  function leave() {
    if (room?.players?.[uid]) leaveCharadesRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/charades'); setScreen('choose');
  }

  async function handOffHost(targetUid: string) {
    try { await makeHost('charades', code, uid, targetUid); } catch (e) { fail(e); }
  }

  async function kick(targetUid: string) {
    if (!isHost) return;
    try { await kickCharadesPlayer(code, uid, targetUid); } catch (e) { fail(e); }
  }

  async function addPhonelessPlayer(playerName: string) {
    try { await addLocalPlayer('charades', code, uid, playerName, (id, n) => ({ id, name: n, team: 'B' as const, score: 0 })); } catch (e) { fail(e); }
  }

  const share = code ? `${location.origin}/housegames/charades/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Charades</Link>
      <HelpModal title="Charades">
        <ol>
          <li><b>Split into teams.</b> One player per team is the Actor for the round and gets a secret word or phrase only they can see.</li>
          <li><b>Act it out.</b> Silently, no props, no talking, no mouthing words, while their team shouts guesses.</li>
          <li><b>Score it.</b> A correct guess before time runs out scores a point and ends the round.</li>
          <li><b>Pass the Actor role</b> to someone new each round.</li>
          <li><b>Win it.</b> Whichever team reaches the target score first, or has the most points when you stop, wins.</li>
        </ol>
      </HelpModal>
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Act it out</div>
          <h1 className="hg-headline">Cha<em>rades</em></h1>
          <p className="hg-lead">No props, no talking. Your team has to guess before the timer runs out.</p>
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
          <RoomHeader gameLabel="Charades" code={code} shareUrl={share} />
          <PlayerList players={players.map((p) => ({ ...p, name: `${p.name} (${p.team ?? '-'}) · ${p.score ?? 0}pt` }))} hostId={room.hostId} />
          <PlayerManager players={players} hostId={room.hostId} isHost={isHost} onMakeHost={handOffHost} onRemove={kick} onAddLocal={addPhonelessPlayer} />
          <div className="actions"><Button onClick={() => setTeam(code, uid, 'A')}>Join Team A</Button><Button onClick={() => setTeam(code, uid, 'B')}>Join Team B</Button></div>
          {isHost && (
            <Field label="Category">
              <select value={s?.category} onChange={(e) => saveSettings('charades', code, room.hostId, { ...s!, category: e.target.value })} className="hg-input">
                {Object.keys(CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          {isHost && <Button wide onClick={begin} style={{ marginTop: 16 }}>Start round</Button>}
          <Button ghost wide onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (room.phase === 'acting') {
    const isActor = s?.actorId === uid;
    return (
      <main>{Header}
        <section className="center">
          <div className="hg-eyebrow">{s?.category}</div>
          {isActor && <div className="word-card">{word ?? '…'}</div>}
          {!isActor && isHost && actorHasNoDevice && localActorWord && (
            <p className="hg-lead">{room.players?.[actorId]?.name}'s word (they have no device): <b>{localActorWord}</b></p>
          )}
          {!isActor && !(isHost && actorHasNoDevice) && (
            <p className="hg-lead">{room.players?.[s?.actorId ?? '']?.name} is acting it out!</p>
          )}
          {s?.roundEndsAt && <Timer endsAt={s.roundEndsAt} onDone={onTimerDone} />}
          <p className="hg-note">Correct: {s?.correctCount ?? 0}</p>
          {isHost && <div className="actions" style={{ justifyContent: 'center' }}><Button onClick={correct}>✓ Correct</Button><Button ghost onClick={() => onTimerDone()}>End round</Button></div>}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  // roundEnd
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
