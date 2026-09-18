import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button, Card, Field, TextInput, ErrorText, PlayerList, useToast } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode } from '@fb/index';
import {
  createSHRoom, joinSHRoom, watchSHRoom, startGame, nominateChancellor, submitChoice, watchVotes,
  clearVotes, resolveVote, presidentDiscard, chancellorDiscard, leaveSHRoom, kickSHPlayer,
  watchMyRole, watchMyDraw, type SHRoom, type SHRoleSecret,
} from './firebase';
import type { Policy } from './game';
import './secret-hitler.css';

const CODE_LENGTH = 5;

export default function SecretHitlerGame() {
  return (
    <div className="sh">
      <RequireIdentity>{(identity) => <SHApp uid={identity.uid} name={identity.name} />}</RequireIdentity>
    </div>
  );
}

function SHApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<SHRoom | null>(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState<SHRoleSecret | null>(null);
  const [draw, setDraw] = useState<{ cards: Policy[] } | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [nomineePick, setNomineePick] = useState('');

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchSHRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code || !room?.players?.[uid]) return;
    return watchMyRole(code, uid, setRole);
  }, [code, uid, room?.players?.[uid]]);

  useEffect(() => {
    if (!code) return;
    return watchMyDraw(code, uid, setDraw);
  }, [code, uid, room?.phase]);

  useEffect(() => {
    if (!code) return;
    return watchVotes(code, setVotes);
  }, [code]);

  // Host reactively resolves each step once the acting player(s) have submitted.
  useEffect(() => {
    if (!isHost || !room || !code) return;
    const alive = Object.values(room.players || {}).filter((p) => p.alive);

    if (room.phase === 'nominate' && votes[room.settings.presidentId]) {
      const nomineeId = votes[room.settings.presidentId];
      clearVotes(code, [room.settings.presidentId]).then(() => nominateChancellor(code, uid, nomineeId)).catch(() => {});
      return;
    }
    if (room.phase === 'vote' && alive.every((p) => votes[p.id])) {
      const cast = Object.fromEntries(alive.map((p) => [p.id, votes[p.id] as 'ja' | 'nein']));
      clearVotes(code, alive.map((p) => p.id)).then(() => resolveVote(code, uid, cast)).catch(() => {});
      return;
    }
    if (room.phase === 'legislativePresident' && votes[room.settings.presidentId] !== undefined) {
      const idx = Number(votes[room.settings.presidentId]);
      clearVotes(code, [room.settings.presidentId]).then(() => presidentDiscard(code, uid, room.settings.presidentId, idx)).catch(() => {});
      return;
    }
    if (room.phase === 'legislativeChancellor' && room.settings.chancellorId && votes[room.settings.chancellorId] !== undefined) {
      const idx = Number(votes[room.settings.chancellorId]);
      clearVotes(code, [room.settings.chancellorId]).then(() => chancellorDiscard(code, uid, room.settings.chancellorId!, idx)).catch(() => {});
    }
  }, [isHost, room, votes, code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try { await createSHRoom(c, uid, name); setCode(c); nav(`/secret-hitler/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError("That room code doesn't look right");
    setError('');
    try { await joinSHRoom(c, uid, name); setCode(c); nav(`/secret-hitler/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  function leave() {
    if (room?.players?.[uid]) leaveSHRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/secret-hitler'); setScreen('choose');
  }

  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Secret Hitler</Link>
      {code && <Button small ghost onClick={leave}>Leave</Button>}
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">Elect governments. Enact policy. Trust no one.</div>
          <h1 className="hg-headline">Secret<br /><em>Hitler.</em></h1>
          <p className="hg-lead">Liberals and fascists share the table. One fascist is secretly Hitler. 5-10 players.</p>
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
  const PolicyTrack = (
    <>
      <div className="policy-track liberal">{Array.from({ length: 5 }).map((_, i) => <div key={i} className={'slot' + (i < room.settings.liberalPolicies ? ' filled' : '')}>{i < room.settings.liberalPolicies ? '✓' : ''}</div>)}</div>
      <div className="policy-track fascist">{Array.from({ length: 6 }).map((_, i) => <div key={i} className={'slot' + (i < room.settings.fascistPolicies ? ' filled' : '')}>{i < room.settings.fascistPolicies ? '✓' : ''}</div>)}</div>
      <div className="status-row">
        <span className="hg-note">Election tracker</span>
        <div className="tracker-dots">{[0, 1, 2].map((i) => <span key={i} className={i < room.settings.electionTracker ? 'on' : ''} />)}</div>
      </div>
    </>
  );

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2>Lobby</h2>
          <PlayerList players={players} hostId={room.hostId} />
          {isHost ? (
            <Button wide disabled={players.length < 5 || players.length > 10} onClick={() => startGame(code, uid).catch(fail)} style={{ marginTop: 18 }}>
              {players.length < 5 ? `Need ${5 - players.length} more` : players.length > 10 ? 'Too many players (max 10)' : 'Start game'}
            </Button>
          ) : <p className="hg-note">Waiting for the host to start ({players.length}/5-10 players)…</p>}
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (room.phase === 'gameOver') {
    return (
      <main>{Header}
        <div className={'role-banner ' + (room.settings.winner ?? '')}>
          <div className="hg-eyebrow" style={{ color: '#fff' }}>Game over</div>
          <h2>{room.settings.winner === 'liberal' ? 'Liberals win.' : 'Fascists win.'}</h2>
        </div>
        {PolicyTrack}
        {role && <p className="hg-note">You were {role.role === 'hitler' ? 'Hitler' : role.role}.</p>}
        <Button onClick={leave}>Back to lobby list</Button>
      </main>
    );
  }

  const president = players.find((p) => p.id === room.settings.presidentId);
  const chancellorNominee = players.find((p) => p.id === room.settings.chancellorNomineeId);
  const chancellor = players.find((p) => p.id === room.settings.chancellorId);

  return (
    <main>{Header}
      <section style={{ maxWidth: 640, margin: '4vh auto', padding: '0 18px' }}>
        <div className="hg-eyebrow">Room {code}</div>
        {PolicyTrack}
        {room.settings.lastEnacted && <p className="hg-note">Last enacted: {room.settings.lastEnacted}</p>}

        {role && (
          <details style={{ margin: '14px 0' }}>
            <summary>Your role</summary>
            <div className={'role-banner ' + role.role}>
              <h2>{role.role === 'hitler' ? 'Hitler' : role.role[0].toUpperCase() + role.role.slice(1)}</h2>
              {role.teammates.length > 0 && <p>You know: {role.teammates.join(', ')}</p>}
            </div>
          </details>
        )}

        {room.phase === 'nominate' && (
          uid === room.settings.presidentId ? (
            <Card>
              <h3>President: nominate a chancellor</h3>
              <select value={nomineePick} onChange={(e) => setNomineePick(e.target.value)} style={{ width: '100%', padding: 12, margin: '10px 0' }}>
                <option value="">Choose…</option>
                {players.filter((p) => p.id !== uid && p.alive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button wide disabled={!nomineePick} onClick={() => submitChoice(code, uid, nomineePick).catch(fail)}>Nominate</Button>
            </Card>
          ) : <p className="hg-note">{president?.name} is nominating a chancellor…</p>
        )}

        {room.phase === 'vote' && (
          votes[uid] ? <p className="hg-note">Vote cast. Waiting on others…</p> : (
            <Card>
              <h3>Vote: {president?.name} &amp; {chancellorNominee?.name}</h3>
              <div className="actions">
                <Button onClick={() => submitChoice(code, uid, 'ja').catch(fail)}>Ja!</Button>
                <Button ghost onClick={() => submitChoice(code, uid, 'nein').catch(fail)}>Nein.</Button>
              </div>
            </Card>
          )
        )}

        {room.phase === 'legislativePresident' && (
          uid === room.settings.presidentId && draw ? (
            <Card>
              <h3>Discard one policy</h3>
              <div className="card-row">
                {draw.cards.map((c, i) => <button key={i} className={'policy-card ' + c} onClick={() => submitChoice(code, uid, String(i)).catch(fail)}>{c}</button>)}
              </div>
            </Card>
          ) : <p className="hg-note">{president?.name} is examining policies…</p>
        )}

        {room.phase === 'legislativeChancellor' && (
          uid === room.settings.chancellorId && draw ? (
            <Card>
              <h3>Discard one, enact the other</h3>
              <div className="card-row">
                {draw.cards.map((c, i) => <button key={i} className={'policy-card ' + c} onClick={() => submitChoice(code, uid, String(i)).catch(fail)}>{c}</button>)}
              </div>
            </Card>
          ) : <p className="hg-note">{chancellor?.name} is enacting a policy…</p>
        )}

        <details style={{ marginTop: 20 }}>
          <summary>Players</summary>
          <PlayerList players={players} hostId={room.hostId} />
        </details>
        <ErrorText>{error}</ErrorText>
      </section>
    </main>
  );
}
