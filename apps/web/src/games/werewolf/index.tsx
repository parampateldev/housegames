import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, ErrorText, PlayerList, VoteGrid, useToast, RoomHeader, PlayerManager, HelpModal,
} from '@ui/index';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import {
  createWerewolfRoom, joinWerewolfRoom, watchWerewolfRoom, watchMySecret,
  assignRolesAndStartNight, submitNightAction, submitWitchPoison,
  resolveNightPhase, startVote, castVote, watchVotes, resolveVote,
  leaveWerewolfRoom, kickPlayer, type WerewolfRoom,
} from './firebase';
import type { WerewolfSecret } from './game';
import './werewolf.css';

const CODE_LENGTH = 5;
const ROLE_LABEL: Record<string, string> = { evil: 'Werewolf', doctor: 'Doctor', detective: 'Seer', witch: 'Witch', villager: 'Villager' };

export default function WerewolfGame() {
  return <div className="wg"><RequireIdentity>{(identity) => <WerewolfApp uid={identity.uid} name={identity.name} />}</RequireIdentity></div>;
}

function WerewolfApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [joinCodeDraft, setJoinCodeDraft] = useState('');
  const [room, setRoom] = useState<WerewolfRoom | null>(null);
  const [mySecret, setMySecret] = useState<WerewolfSecret | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [nightTarget, setNightTarget] = useState('');
  const [poisonTarget, setPoisonTarget] = useState('');

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchWerewolfRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code || !room?.players?.[uid]) return;
    return watchMySecret(code, uid, setMySecret);
  }, [code, uid, room?.players?.[uid]]);

  useEffect(() => {
    if (!code || room?.phase !== 'vote') { setVotes({}); return; }
    return watchVotes(code, setVotes);
  }, [code, room?.phase]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createWerewolfRoom(c, uid, { id: uid, name, alive: true });
      setCode(c); nav(`/werewolf/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinWerewolfRoom(c, { id: uid, name, alive: true });
      setCode(c); nav(`/werewolf/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leaveWerewolfRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/werewolf'); setScreen('choose');
  }

  const share = code ? `${location.origin}/housegames/werewolf/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Werewolf</Link>
      <HelpModal title="Werewolf">
        <ol>
          <li><b>Roles are dealt in secret.</b> A minority of players are secretly Werewolves. Everyone else is a Villager. Larger games also get a Seer, who checks one player each night, and, at 7 or more players, a Witch with one healing potion and one poison, each usable once across the whole game.</li>
          <li><b>Night falls.</b> The Werewolves silently choose a victim. The Seer learns if one player is a Werewolf. The Witch may use her save or her poison, on any night she chooses.</li>
          <li><b>Day breaks.</b> Whoever died overnight is revealed. The village debates and votes to hang one suspect.</li>
          <li><b>That player is eliminated</b>, whatever they were. Repeat night and day.</li>
          <li><b>Win it.</b> The Village wins once every Werewolf is gone. The Werewolves win once they equal or outnumber the Village.</li>
        </ol>
      </HelpModal>
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">A hidden minority hunts the town</div>
          <h1 className="hg-headline">Trust <em>no one.</em></h1>
          <p className="hg-lead">The wolves kill by night. The town votes by day. Find them before they find you.</p>
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
          <input className="hg-input" value={joinCodeDraft} onChange={(e) => setJoinCodeDraft(e.target.value.toUpperCase())} placeholder="ABCDE" maxLength={CODE_LENGTH} style={{ marginTop: 16 }} />
          <Button wide onClick={() => joinWithCode(joinCodeDraft)} style={{ marginTop: 18 }}>Join game</Button>
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
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join this game?</h2>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const players = Object.values(room.players || {}).filter((p) => p && p.id && p.name);
  const alivePlayers = players.filter((p) => p.alive);

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
          <RoomHeader gameLabel="Werewolf" code={code} shareUrl={share} />
          <Card>
            <h3>Players ({players.length})</h3>
            <PlayerList players={players} hostId={room.hostId} />
            <PlayerManager
              players={players}
              hostId={room.hostId}
              isHost={isHost}
              onMakeHost={(target) => makeHost('werewolf', code, uid, target).catch(fail)}
              onRemove={(target) => kickPlayer(code, uid, target).catch(fail)}
              onAddLocal={(n) => addLocalPlayer('werewolf', code, uid, n, (id, nm) => ({ id, name: nm, alive: true })).catch(fail)}
            />
            {isHost && (
              <Button wide disabled={players.length < 4} onClick={() => assignRolesAndStartNight(code, uid).catch(fail)} style={{ marginTop: 20 }}>
                {players.length < 4 ? 'Need at least 4 players' : 'Assign roles & start'}
              </Button>
            )}
            <ErrorText>{error}</ErrorText>
          </Card>
        </div>
      </main>
    );
  }

  if (room.phase === 'gameOver') {
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="night-card">
            <div className="hg-eyebrow">Game over</div>
            <h2>{room.settings.winner === 'evil' ? 'The wolves win.' : 'The town wins.'}</h2>
          </div>
          <Card>
            <h3>Final roles</h3>
            <PlayerList players={players} hostId={room.hostId} />
            <Button wide onClick={leave} style={{ marginTop: 16 }}>Back to lobby</Button>
          </Card>
        </div>
      </main>
    );
  }

  if (room.phase === 'night') {
    const role = mySecret?.role;
    const alive = room.players[uid]?.alive;
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
          <div className="night-card">
            <span className="role-badge">{role ? ROLE_LABEL[role] : '…'}</span>
            <h2>Night {room.settings.round}</h2>
            {role === 'evil' && mySecret?.teammates && <p className="teammates">With you: {mySecret.teammates.join(', ') || 'no one else'}</p>}
            {!alive && <p className="hg-note" style={{ color: '#fff' }}>You've been eliminated, watch how it plays out.</p>}
            {alive && (role === 'evil' || role === 'doctor' || role === 'detective') && (
              <div style={{ marginTop: 20 }}>
                <VoteGrid
                  players={alivePlayers.filter((p) => p.id !== uid || role !== 'evil')}
                  selectedId={nightTarget}
                  onVote={(id) => { setNightTarget(id); submitNightAction(code, uid, room.settings.round, id).catch(fail); }}
                />
                <p className="waiting-note">{role === 'evil' ? 'Choose who the wolves kill tonight.' : role === 'doctor' ? 'Choose who to save.' : 'Choose who to investigate.'}</p>
              </div>
            )}
            {alive && role === 'witch' && (
              <div style={{ marginTop: 20 }}>
                {!mySecret?.witchSaveUsed && (
                  <>
                    <VoteGrid players={alivePlayers} selectedId={nightTarget} onVote={(id) => { setNightTarget(id); submitNightAction(code, uid, room.settings.round, id).catch(fail); }} />
                    <p className="waiting-note">Save someone (once per game).</p>
                  </>
                )}
                {!mySecret?.witchPoisonUsed && (
                  <>
                    <VoteGrid players={alivePlayers} selectedId={poisonTarget} onVote={(id) => { setPoisonTarget(id); submitWitchPoison(code, uid, room.settings.round, id).catch(fail); }} />
                    <p className="waiting-note">Poison someone (once per game).</p>
                  </>
                )}
              </div>
            )}
            {alive && role === 'villager' && <p className="waiting-note">No action tonight, wait for dawn.</p>}
            {mySecret?.nightResult && mySecret.nightResult.round === room.settings.round - 1 && (
              <div className="investigate-result">Your last check: {players.find((p) => p.id === mySecret.nightResult!.targetUid)?.name} is {mySecret.nightResult.isEvil ? 'a WEREWOLF' : 'innocent'}.</div>
            )}
            {isHost && <Button ghost onClick={() => resolveNightPhase(code, uid).catch(fail)} style={{ marginTop: 20 }}>Resolve night</Button>}
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      </main>
    );
  }

  if (room.phase === 'day') {
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
          <div className="day-summary">
            <div className="hg-eyebrow">Day {room.settings.round}</div>
            <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>
              {room.settings.lastDeaths.length ? `${room.settings.lastDeaths.map((id) => players.find((p) => p.id === id)?.name).join(', ')} died in the night.` : 'No one died last night.'}
            </h2>
          </div>
          <Card>
            <h3>Alive ({alivePlayers.length})</h3>
            <PlayerList players={players} hostId={room.hostId} />
            {isHost && <Button wide onClick={() => startVote(code, uid).catch(fail)} style={{ marginTop: 20 }}>Start the vote</Button>}
          </Card>
          <ErrorText>{error}</ErrorText>
        </div>
      </main>
    );
  }

  // vote
  const myVote = votes[uid];
  return (
    <main>{Header}
      <div className="room-wrap">
        <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Who's the werewolf?</h2>
        <Card>
          {room.players[uid]?.alive ? (
            <VoteGrid players={alivePlayers} selectedId={myVote} onVote={(id) => castVote(code, uid, id).catch(fail)} />
          ) : <p className="hg-note">You're eliminated, watch the vote.</p>}
          <p className="waiting-note">{Object.keys(votes).length}/{alivePlayers.length} voted</p>
          {isHost && <Button wide onClick={() => resolveVote(code, uid).catch(fail)} style={{ marginTop: 16 }}>Resolve vote</Button>}
          <ErrorText>{error}</ErrorText>
        </Card>
      </div>
    </main>
  );
}
