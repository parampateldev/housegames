import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, ErrorText, PlayerList, VoteGrid, useToast, RoomHeader, PlayerManager, HelpModal,
} from '@ui/index';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import {
  createMafiaRoom, joinMafiaRoom, watchMafiaRoom, watchMySecret, watchLocalSecrets,
  assignRolesAndStartNight, submitNightAction, submitVigilanteShot,
  resolveNightPhase, startVote, castVote, watchVotes, resolveVote,
  leaveMafiaRoom, kickPlayer, recommendedMafiaOptions, type MafiaRoom, type MafiaRoleOptions,
} from './firebase';
import type { MafiaSecret } from './game';
import './mafia.css';

const CODE_LENGTH = 5;
const ROLE_LABEL: Record<string, string> = { evil: 'Mafia', doctor: 'Doctor', detective: 'Detective', vigilante: 'Vigilante', villager: 'Villager' };

export default function MafiaGame() {
  return <div className="mg"><RequireIdentity>{(identity) => <MafiaApp uid={identity.uid} name={identity.name} />}</RequireIdentity></div>;
}

function MafiaApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [joinCodeDraft, setJoinCodeDraft] = useState('');
  const [room, setRoom] = useState<MafiaRoom | null>(null);
  const [mySecret, setMySecret] = useState<MafiaSecret | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [nightTarget, setNightTarget] = useState('');
  const [localSecrets, setLocalSecrets] = useState<Record<string, MafiaSecret>>({});
  const [roleOptions, setRoleOptions] = useState<MafiaRoleOptions | null>(null);

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchMafiaRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (!code || !room?.players?.[uid]) return;
    return watchMySecret(code, uid, setMySecret);
  }, [code, uid, room?.players?.[uid]]);

  useEffect(() => {
    if (!code || room?.phase !== 'vote') { setVotes({}); return; }
    return watchVotes(code, setVotes);
  }, [code, room?.phase]);

  // Host-only: local (no-device) players' roles, so the host can act for
  // whichever ones hold a role that needs a night action.
  const localAliveUids = Object.values(room?.players ?? {})
    .filter((p) => p.alive && p.id.startsWith('local-'))
    .map((p) => p.id);
  useEffect(() => {
    if (!code || !isHost || room?.phase !== 'night' || localAliveUids.length === 0) { setLocalSecrets({}); return; }
    return watchLocalSecrets(code, localAliveUids, setLocalSecrets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isHost, room?.phase, localAliveUids.join(',')]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createMafiaRoom(c, uid, { id: uid, name, alive: true });
      setCode(c); nav(`/mafia/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinMafiaRoom(c, { id: uid, name, alive: true });
      setCode(c); nav(`/mafia/${c}`); setScreen('room');
    } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leaveMafiaRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/mafia'); setScreen('choose');
  }

  const share = code ? `${location.origin}/housegames/mafia/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Mafia</Link>
      <HelpModal title="Mafia">
        <ol>
          <li><b>Roles are dealt in secret.</b> A minority of players are secretly Mafia. Everyone else is an innocent Villager, unless the host turns on extra roles: a Doctor who can save someone each night, a Detective who can investigate one player each night, and a Vigilante with one bullet for the whole game. The host sets the mafia count and which of these are in play from the lobby.</li>
          <li><b>Night falls.</b> The Mafia silently choose someone to eliminate. The Doctor may protect one player. The Detective learns whether one player is Mafia or innocent. The Vigilante may take their one shot, now or later.</li>
          <li><b>Day breaks.</b> Whoever died overnight is announced. Everyone discusses who they suspect, then votes to eliminate one player.</li>
          <li><b>The accused is out</b>, Mafia or innocent. Repeat night and day.</li>
          <li><b>Win it.</b> The Village wins once every Mafia member is gone. The Mafia win once they equal or outnumber the Village.</li>
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
          <p className="hg-lead">The mafia kill by night. The town votes by day. Find them before they find you.</p>
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
    const opts = roleOptions ?? recommendedMafiaOptions(Math.max(players.length, 4));
    const namedCount = opts.evilCount + (opts.hasDetective ? 1 : 0) + (opts.hasDoctor ? 1 : 0) + (opts.hasVigilante ? 1 : 0);
    const maxEvil = Math.max(1, Math.ceil(players.length / 2) - 1);
    const tooManyRoles = players.length >= 4 && namedCount >= players.length;
    const updateOpts = (patch: Partial<MafiaRoleOptions>) => setRoleOptions({ ...opts, ...patch });
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
          <RoomHeader gameLabel="Mafia" code={code} shareUrl={share} />
          <Card>
            <h3>Players ({players.length})</h3>
            <PlayerList players={players} hostId={room.hostId} />
            <PlayerManager
              players={players}
              hostId={room.hostId}
              isHost={isHost}
              onMakeHost={(target) => makeHost('mafia', code, uid, target).catch(fail)}
              onRemove={(target) => kickPlayer(code, uid, target).catch(fail)}
              onAddLocal={(n) => addLocalPlayer('mafia', code, uid, n, (id, nm) => ({ id, name: nm, alive: true })).catch(fail)}
            />
            {isHost && (
              <div className="hg-player-manager">
                <h3>Roles</h3>
                <div className="hg-row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                  <span className="hg-field-label" style={{ margin: 0 }}>Mafia</span>
                  <div className="hg-stepper">
                    <button type="button" onClick={() => updateOpts({ evilCount: Math.max(1, opts.evilCount - 1) })} disabled={opts.evilCount <= 1}>−</button>
                    <span className="val">{opts.evilCount}</span>
                    <button type="button" onClick={() => updateOpts({ evilCount: Math.min(maxEvil, opts.evilCount + 1) })} disabled={opts.evilCount >= maxEvil}>+</button>
                  </div>
                </div>
                <div className="hg-chip-row" style={{ marginTop: 14 }}>
                  <button type="button" className={`hg-chip${opts.hasDoctor ? ' on' : ''}`} onClick={() => updateOpts({ hasDoctor: !opts.hasDoctor })}>Doctor</button>
                  <button type="button" className={`hg-chip${opts.hasDetective ? ' on' : ''}`} onClick={() => updateOpts({ hasDetective: !opts.hasDetective })}>Detective</button>
                  <button type="button" className={`hg-chip${opts.hasVigilante ? ' on' : ''}`} onClick={() => updateOpts({ hasVigilante: !opts.hasVigilante })}>Vigilante</button>
                </div>
                <p className="hg-note" style={{ marginTop: 10 }}>
                  {tooManyRoles
                    ? 'Too many special roles for this many players, turn one off.'
                    : (() => { const v = Math.max(Math.max(players.length, 4) - namedCount, 0); return `${v} villager${v === 1 ? '' : 's'} fill the rest.`; })()}
                </p>
              </div>
            )}
            {isHost && (
              <Button wide disabled={players.length < 4 || tooManyRoles} onClick={() => assignRolesAndStartNight(code, uid, opts).catch(fail)} style={{ marginTop: 20 }}>
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
            <h2>{room.settings.winner === 'evil' ? 'The mafia wins.' : 'The town wins.'}</h2>
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
                <p className="waiting-note">{role === 'evil' ? 'Choose who the mafia kills tonight.' : role === 'doctor' ? 'Choose who to save.' : 'Choose who to investigate.'}</p>
              </div>
            )}
            {alive && role === 'vigilante' && (
              <div style={{ marginTop: 20 }}>
                {mySecret?.vigilanteShotUsed ? (
                  <p className="waiting-note">You've used your one shot. Wait for dawn.</p>
                ) : (
                  <>
                    <VoteGrid players={alivePlayers.filter((p) => p.id !== uid)} selectedId={nightTarget} onVote={(id) => { setNightTarget(id); submitVigilanteShot(code, uid, room.settings.round, id).catch(fail); }} />
                    <p className="waiting-note">Take your one shot, or leave it be tonight.</p>
                  </>
                )}
              </div>
            )}
            {alive && role === 'villager' && <p className="waiting-note">No action tonight, wait for dawn.</p>}
            {mySecret?.nightResult && mySecret.nightResult.round === room.settings.round - 1 && (
              <div className="investigate-result">Your last check: {players.find((p) => p.id === mySecret.nightResult!.targetUid)?.name} is {mySecret.nightResult.isEvil ? 'MAFIA' : 'innocent'}.</div>
            )}
            {isHost && localAliveUids.map((localUid) => {
              const secret = localSecrets[localUid];
              const localName = players.find((p) => p.id === localUid)?.name ?? 'Player';
              if (!secret?.role || secret.role === 'villager') return null;
              const alreadyActed = secret.nightAction?.round === room.settings.round || secret.vigilanteShotUsed;
              if (alreadyActed) return null;
              return (
                <div key={localUid} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.2)' }}>
                  <p className="waiting-note">{localName} (no phone) is {ROLE_LABEL[secret.role]}.</p>
                  {(secret.role === 'evil' || secret.role === 'doctor' || secret.role === 'detective') && (
                    <VoteGrid
                      players={alivePlayers.filter((p) => p.id !== localUid || secret.role !== 'evil')}
                      onVote={(id) => submitNightAction(code, localUid, room.settings.round, id).catch(fail)}
                    />
                  )}
                  {secret.role === 'vigilante' && (
                    <>
                      <p className="waiting-note">Their one shot for the game, or skip:</p>
                      <VoteGrid players={alivePlayers.filter((p) => p.id !== localUid)} onVote={(id) => submitVigilanteShot(code, localUid, room.settings.round, id).catch(fail)} />
                    </>
                  )}
                </div>
              );
            })}
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
              {/* Firebase drops an empty-array field on write, so lastDeaths is undefined, not [], when nobody died. */}
              {room.settings.lastDeaths?.length ? `${room.settings.lastDeaths.map((id) => players.find((p) => p.id === id)?.name).join(', ')} died in the night.` : 'No one died last night.'}
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
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Who's the mafia?</h2>
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
