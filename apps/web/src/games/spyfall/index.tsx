import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, Timer, PlayerList, VoteGrid, useToast, RoomHeader, PlayerManager, HelpModal } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, getAllSecretsOnce, makeHost, addLocalPlayer } from '@fb/index';
import {
  createSpyfallRoom, joinSpyfallRoom, watchSpyfallRoom, watchMySecretRole,
  dealAndStart, castVote, clearVotes, revealLocationToAll, advancePhase,
  leaveSpyfallRoom, kickSpyfallPlayer, type SpyfallRoom, type MySecret,
} from './firebase';
import { dealRound, tallyVote, type Player } from './game';
import { LOCATIONS } from './locations';
import './spyfall.css';

const CODE_LENGTH = 5;

export default function SpyfallGame() {
  return <div className="sf"><RequireIdentity>{(id) => <App uid={id.uid} name={id.name} />}</RequireIdentity></div>;
}

function App({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { code: urlCode } = useParams();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [timerMinutes, setTimerMinutes] = useState(8);
  const [room, setRoom] = useState<SpyfallRoom | null>(null);
  const [secret, setSecretState] = useState<MySecret | null>(null);
  const [error, setError] = useState('');
  const [voteTarget, setVoteTarget] = useState('');
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const isHost = room?.hostId === uid;

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchSpyfallRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code) return;
    return watchMySecretRole(code, uid, setSecretState);
  }, [code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createSpyfallRoom(c, uid, { id: uid, name }, { timerSeconds: timerMinutes * 60 });
      setCode(c); nav(`/spyfall/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(raw: string) {
    const c = raw.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinSpyfallRoom(c, { id: uid, name });
      setCode(c); nav(`/spyfall/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function startRound() {
    if (!room) return;
    setError('');
    try {
      const playerIds = Object.keys(room.players || {});
      const deal = dealRound(playerIds, LOCATIONS);
      await clearVotes(code);
      await dealAndStart(code, uid, deal, room.settings?.timerSeconds || timerMinutes * 60);
    } catch (e) { fail(e); }
  }

  async function vote(target: string) {
    setVoteTarget(target);
    try { await castVote(code, uid, target); } catch (e) { fail(e); }
  }

  // The host can read every player's secret (rules grant host-only reads on
  // any uid's secret path), so resolution fetches all of them rather than
  // relying on the host's OWN secret, which has no `location` at all in
  // the one case that matters most: the host themselves being the spy.
  async function resolveVote() {
    if (!room || !room.votes) return;
    const { accusedId, tie } = tallyVote(room.votes);
    if (tie || !accusedId) { await clearVotes(code); return; }
    const allUids = Object.keys(room.players || {});
    const allSecrets = await getAllSecretsOnce<MySecret>('spyfall', code, allUids);
    const spyEntry = Object.entries(allSecrets).find(([, s]) => 'isSpy' in s && s.isSpy);
    const locationEntry = Object.values(allSecrets).find((s) => 'location' in s && s.location) as { location: string } | undefined;
    if (!spyEntry || !locationEntry) { setError('Could not resolve the round'); return; }
    await revealLocationToAll(code, uid, allUids, locationEntry.location, spyEntry[0]);
  }

  function leave() {
    if (room?.players?.[uid]) leaveSpyfallRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/spyfall'); setScreen('choose');
  }

  const share = code ? `${location.origin}/housegames/spyfall/${code}` : '';

  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Spyfall</Link>
      <HelpModal title="Spyfall">
        <ol>
          <li><b>Everyone but the Spy is secretly told the same location</b> and a role there, say "Airplane: Pilot." The Spy is told nothing except the list of possible locations.</li>
          <li><b>Question each other.</b> Players ask each other about the location, trying to sound like they belong, while the Spy bluffs along without knowing where "there" is.</li>
          <li><b>Call a vote any time.</b> If the group accuses correctly and catches the Spy, the Spy gets one chance to guess the location. Guessing right still wins the round for the Spy.</li>
          <li><b>Time runs out, or the group accuses wrong</b>, the Spy wins the round.</li>
          <li><b>Rotate</b> and play again with a new location and a new Spy.</li>
        </ol>
      </HelpModal>
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Find the fake</div>
          <h1 className="hg-headline">Spy<em>fall</em></h1>
          <p className="hg-lead">Everyone knows the location, except the spy. Ask questions. Don't give it away.</p>
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

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <Card>
          <RoomHeader gameLabel="Spyfall" code={code} shareUrl={share} />
          <PlayerList players={players} hostId={room.hostId} />
          <PlayerManager
            players={players}
            hostId={room.hostId}
            isHost={isHost}
            onMakeHost={(target) => makeHost('spyfall', code, uid, target).catch(fail)}
            onRemove={(target) => kickSpyfallPlayer(code, uid, target).catch(fail)}
            onAddLocal={(n) => addLocalPlayer('spyfall', code, uid, n, (id, nm) => ({ id, name: nm })).catch(fail)}
          />
          {isHost && (
            <>
              <Field label={`Discussion timer, ${timerMinutes} min`}>
                <input type="range" min={4} max={15} value={timerMinutes} onChange={(e) => setTimerMinutes(+e.target.value)} style={{ width: '100%', accentColor: 'var(--hg-rust)' }} />
              </Field>
              <Button wide disabled={players.length < 3} onClick={startRound} style={{ marginTop: 16 }}>Deal & start</Button>
              {players.length < 3 && <p className="hg-note">Need at least 3 players.</p>}
            </>
          )}
          <Button ghost wide onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (room.phase === 'discussion' || room.phase === 'vote') {
    const isSpy = secret && 'isSpy' in secret && secret.isSpy;
    return (
      <main>{Header}
        <section style={{ padding: '2vh clamp(18px,5vw,72px)' }}>
          {secret && !('revealed' in secret) && (
            <div className="role-card">
              {isSpy ? (
                <>
                  <div className="spy">You're the Spy</div>
                  <p>Figure out the location before they figure out you.</p>
                </>
              ) : (
                <>
                  <div className="loc">{'location' in secret ? secret.location : ''}</div>
                  <div className="role">{'role' in secret ? secret.role : ''}</div>
                </>
              )}
            </div>
          )}
          {isSpy && (
            <div className="locations-list">
              {LOCATIONS.map((l) => <span key={l.name}>{l.name}</span>)}
            </div>
          )}
          {room.settings?.discussionEndsAt && room.phase === 'discussion' && (
            <div className="center"><Timer endsAt={room.settings.discussionEndsAt} /></div>
          )}
          <h3>Who's the spy?</h3>
          <VoteGrid players={players} selectedId={voteTarget} onVote={vote} />
          {isHost && (
            <Button wide onClick={resolveVote} style={{ marginTop: 16 }}>Reveal result</Button>
          )}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  // results
  const revealed = secret && 'revealed' in secret ? secret : null;
  return (
    <main>{Header}
      <section className="center">
        <div className="hg-eyebrow">Round over</div>
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{revealed ? `The location was ${revealed.location}` : 'Resolving…'}</h2>
        {revealed && <p className="hg-note">The spy was {players.find((p) => p.id === revealed.spyId)?.name ?? 'unknown'}.</p>}
        {isHost && <Button onClick={() => advancePhase(code, uid, 'lobby')} style={{ marginTop: 16 }}>Back to lobby</Button>}
        <Button ghost onClick={leave} style={{ marginTop: 10 }}>Leave room</Button>
      </section>
    </main>
  );
}
