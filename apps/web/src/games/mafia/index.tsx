import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, ErrorText, PlayerList, VoteGrid, useToast, RoomHeader, PlayerManager, HelpModal,
} from '@ui/index';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { MAFIA_ROLE_PRESETS, ROLE_BEHAVIOR_LABEL, type RoleDef, type RoleBehavior, type Team } from '@engines/elimination/index';
import {
  createMafiaRoom, joinMafiaRoom, watchMafiaRoom, watchMySecret, watchLocalSecrets,
  assignRolesAndStartNight, submitNightAction,
  resolveNightPhase, startVote, castVote, watchVotes, resolveVote,
  leaveMafiaRoom, kickPlayer, recommendedMafiaRoles, validateRoleComposition, type MafiaRoom,
} from './firebase';
import type { MafiaSecret } from './game';
import './mafia.css';

const CODE_LENGTH = 5;
const CREATABLE_BEHAVIORS: RoleBehavior[] = ['kill', 'investigate', 'protect', 'solo-kill', 'extra-vote', 'none'];

export default function MafiaGame() {
  return <div className="mg"><RequireIdentity>{(identity) => <MafiaApp uid={identity.uid} name={identity.name} />}</RequireIdentity></div>;
}

function RoleEditor({ roles, onChange, playerCount }: { roles: RoleDef[]; onChange: (r: RoleDef[]) => void; playerCount: number }) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftTeam, setDraftTeam] = useState<Team>('town');
  const [draftBehavior, setDraftBehavior] = useState<RoleBehavior>('none');

  const total = roles.reduce((s, r) => s + r.count, 0);
  const error = validateRoleComposition(playerCount, roles);
  const availablePresets = MAFIA_ROLE_PRESETS.filter((p) => !roles.some((r) => r.id.toLowerCase() === p.id.toLowerCase()));

  const updateCount = (index: number, delta: number) => {
    const next = roles.map((r, i) => (i === index ? { ...r, count: Math.max(0, r.count + delta) } : r));
    onChange(next.filter((r) => r.count > 0));
  };
  const removeRole = (index: number) => onChange(roles.filter((_, i) => i !== index));
  const addPreset = (presetId: string) => {
    const preset = MAFIA_ROLE_PRESETS.find((p) => p.id === presetId);
    if (preset) onChange([...roles, { id: preset.id, team: preset.team, behaviors: preset.behaviors, count: 1 }]);
  };
  const confirmCustomRole = () => {
    const name = draftName.trim();
    if (!name) return;
    onChange([...roles, { id: name, team: draftTeam, behaviors: [draftBehavior], count: 1 }]);
    setDraftName(''); setDraftTeam('town'); setDraftBehavior('none'); setCreating(false);
  };

  return (
    <div className="hg-player-manager">
      <h3>Roles</h3>
      <ul className="hg-manage-list" style={{ marginTop: 10 }}>
        {roles.map((r, i) => (
          <li key={`${r.id}_${i}`}>
            <span>
              <b>{r.id}</b>{' '}
              <span className="hg-note" style={{ fontSize: 12 }}>
                ({r.team === 'evil' ? 'mafia team' : 'town team'} · {ROLE_BEHAVIOR_LABEL[r.behaviors[0]] ?? 'no powers'})
              </span>
            </span>
            <span className="hg-row">
              <div className="hg-stepper">
                <button type="button" onClick={() => updateCount(i, -1)}>−</button>
                <span className="val">{r.count}</span>
                <button type="button" onClick={() => updateCount(i, 1)}>+</button>
              </div>
              <button type="button" className="hg-mini-btn hg-mini-danger" onClick={() => removeRole(i)}>Remove</button>
            </span>
          </li>
        ))}
      </ul>

      {availablePresets.length > 0 && (
        <div className="hg-chip-row" style={{ marginTop: 14 }}>
          {availablePresets.map((p) => (
            <button key={p.id} type="button" className="hg-chip" onClick={() => addPreset(p.id)} title={p.description}>+ {p.id}</button>
          ))}
        </div>
      )}

      {!creating ? (
        <Button ghost small onClick={() => setCreating(true)} style={{ marginTop: 14 }}>+ Create a role</Button>
      ) : (
        <div className="hg-player-manager-panel" style={{ marginTop: 14 }}>
          <input className="hg-input" placeholder="Role name (e.g. Bodyguard)" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          <div className="hg-seg" style={{ marginTop: 14 }}>
            <button type="button" className={draftTeam === 'town' ? 'on' : ''} onClick={() => setDraftTeam('town')}>Town team</button>
            <button type="button" className={draftTeam === 'evil' ? 'on' : ''} onClick={() => setDraftTeam('evil')}>Mafia team</button>
          </div>
          <select className="hg-input" style={{ marginTop: 14 }} value={draftBehavior} onChange={(e) => setDraftBehavior(e.target.value as RoleBehavior)}>
            {CREATABLE_BEHAVIORS.map((b) => <option key={b} value={b}>{ROLE_BEHAVIOR_LABEL[b]}</option>)}
          </select>
          <div className="hg-row" style={{ marginTop: 16 }}>
            <Button small onClick={confirmCustomRole} disabled={!draftName.trim()}>Add role</Button>
            <Button ghost small onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <p className="hg-note" style={{ marginTop: 12 }}>
        {error ?? `${total}/${playerCount} players assigned. Ready to start.`}
      </p>
    </div>
  );
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
  const [roleConfig, setRoleConfig] = useState<RoleDef[] | null>(null);

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
          <li><b>Roles are dealt in secret.</b> The host builds the roster from the lobby: how many Mafia, and which town roles are in play (Police, Doctor, Vigilante, Mayor, Townie, or roles the host makes up themselves). Everyone gets exactly one role, kept secret the whole game.</li>
          <li><b>Night falls.</b> The Mafia silently agree on someone to eliminate. A Doctor-type role may protect one player. A Police-type role learns whether one player is Mafia or innocent. A Vigilante-type role may take their one shot, now or later.</li>
          <li><b>Day breaks.</b> Whoever died overnight is announced. Everyone discusses who they suspect, then votes to eliminate one player. A Mayor-type role's vote counts twice.</li>
          <li><b>The accused is out</b>, Mafia or innocent. Repeat night and day.</li>
          <li><b>Win it.</b> The town wins once every Mafia member is gone. The Mafia win once they equal or outnumber the town.</li>
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
    const displayCount = Math.max(players.length, 4);
    const roles = roleConfig ?? recommendedMafiaRoles(displayCount);
    const startError = players.length < 4 ? 'Need at least 4 players' : validateRoleComposition(players.length, roles);
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
            {isHost && <RoleEditor roles={roles} onChange={setRoleConfig} playerCount={displayCount} />}
            {isHost && (
              <Button wide disabled={!!startError} onClick={() => assignRolesAndStartNight(code, uid, roles).catch(fail)} style={{ marginTop: 20 }}>
                {startError ?? 'Assign roles & start'}
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
    const behavior = mySecret?.behavior;
    const alive = room.players[uid]?.alive;
    const canAct = (b?: RoleBehavior) => b === 'kill' || b === 'protect' || b === 'investigate' || b === 'solo-kill';
    const actionLabel = behavior === 'kill' ? 'Choose who your team eliminates tonight.'
      : behavior === 'protect' ? 'Choose who to protect.'
      : behavior === 'investigate' ? 'Choose who to investigate.'
      : behavior === 'solo-kill' ? 'Take your one shot, or leave it be tonight.' : '';
    return (
      <main>{Header}
        <div className="room-wrap">
          <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
          <div className="night-card">
            <span className="role-badge">{mySecret?.role ?? '…'}</span>
            <h2>Night {room.settings.round}</h2>
            {mySecret?.team === 'evil' && mySecret?.teammates && <p className="teammates">With you: {mySecret.teammates.join(', ') || 'no one else'}</p>}
            {!alive && <p className="hg-note" style={{ color: '#fff' }}>You've been eliminated, watch how it plays out.</p>}
            {alive && behavior === 'solo-kill' && mySecret?.usedOnce && (
              <p className="waiting-note">You've used your one shot. Wait for dawn.</p>
            )}
            {alive && canAct(behavior) && !(behavior === 'solo-kill' && mySecret?.usedOnce) && (
              <div style={{ marginTop: 20 }}>
                <VoteGrid
                  players={alivePlayers.filter((p) => p.id !== uid || (behavior !== 'kill' && behavior !== 'solo-kill'))}
                  selectedId={nightTarget}
                  onVote={(id) => { setNightTarget(id); submitNightAction(code, uid, room.settings.round, id, behavior === 'solo-kill').catch(fail); }}
                />
                <p className="waiting-note">{actionLabel}</p>
              </div>
            )}
            {alive && !canAct(behavior) && <p className="waiting-note">{behavior === 'extra-vote' ? 'No night power. Your day vote counts twice.' : 'No action tonight, wait for dawn.'}</p>}
            {mySecret?.nightResult && mySecret.nightResult.round === room.settings.round - 1 && (
              <div className="investigate-result">Your last check: {players.find((p) => p.id === mySecret.nightResult!.targetUid)?.name} is {mySecret.nightResult.isEvil ? 'MAFIA' : 'innocent'}.</div>
            )}
            {isHost && localAliveUids.map((localUid) => {
              const secret = localSecrets[localUid];
              const localName = players.find((p) => p.id === localUid)?.name ?? 'Player';
              if (!secret?.behavior || !canAct(secret.behavior)) return null;
              const alreadyActed = secret.nightAction?.round === room.settings.round || (secret.behavior === 'solo-kill' && secret.usedOnce);
              if (alreadyActed) return null;
              return (
                <div key={localUid} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.2)' }}>
                  <p className="waiting-note">{localName} (no phone) is {secret.role}.</p>
                  <VoteGrid
                    players={alivePlayers.filter((p) => p.id !== localUid || (secret.behavior !== 'kill' && secret.behavior !== 'solo-kill'))}
                    onVote={(id) => submitNightAction(code, localUid, room.settings.round, id, secret.behavior === 'solo-kill').catch(fail)}
                  />
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
