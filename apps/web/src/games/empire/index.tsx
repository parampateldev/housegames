import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, Field, TextInput, ErrorText, QR, PlayerList, RoomHeader, PlayerManager,
} from '@ui/index';
import { useToast } from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import {
  createEmpireRoom, joinEmpireRoom, watchEmpireRoom, submitWord, watchAllWords,
  beginReveal, hideReveal, watchReveal, savePlayers, saveTheme, saveTimerOff,
  leaveEmpireRoom, kickPlayer, type EmpireRoom, type Reveal,
} from './firebase';
import { mk, capture, recordCapture, undoCapture, setPlayerStatus, winner, remainingMs, type Player, type CaptureRecord } from './game';
import './empire.css';

const CODE_LENGTH = 6;

export default function EmpireGame() {
  return (
    <div className="eg">
      <RequireIdentity>{(identity) => <EmpireApp uid={identity.uid} name={identity.name} />}</RequireIdentity>
    </div>
  );
}

function EmpireApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'setup' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState(30);
  const [timerOn, setTimerOn] = useState(true);
  const [secret, setSecret] = useState('');
  const [localSecrets, setLocalSecrets] = useState<Record<string, string>>({});
  const [room, setRoom] = useState<EmpireRoom | null>(null);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState('');
  const [words, setWords] = useState<Record<string, { word: string }>>({});
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [now, setNow] = useState(Date.now());

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchEmpireRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, (m) => setError(m));
  }, [screen, code]);

  useEffect(() => {
    if (!isHost || !code || !(room?.phase === 'playing' || room?.phase === 'finished')) return;
    return watchAllWords(code, Object.keys(room?.players ?? {}), setWords);
  }, [isHost, code, room?.phase]);

  useEffect(() => { if (room?.settings?.category) setThemeDraft(room.settings.category); }, [room?.settings?.category]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (room?.phase !== 'reveal' || !code) { setReveal(null); return; }
    return watchReveal(code, setReveal, () => setReveal(null));
  }, [room?.phase, code]);

  // Host auto-hides the list once the timer runs out. endsAt===0 means no timer.
  useEffect(() => {
    if (!isHost || room?.phase !== 'reveal' || !code) return;
    if (reveal && reveal.endsAt > 0 && remainingMs(reveal.endsAt, now) === 0) {
      hideReveal(code, uid).catch(() => {});
    }
  }, [now, room?.phase, reveal, isHost, code, uid]);

  async function host() {
    if (!category.trim()) return setError('Add a theme');
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createEmpireRoom(c, uid, mk(uid, name), { category: category.trim(), revealSeconds: duration, timerOff: !timerOn });
      setCode(c);
      nav(`/empire/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError('That room code doesn\'t look right');
    setError('');
    try {
      await joinEmpireRoom(c, mk(uid, name));
      setCode(c);
      nav(`/empire/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  async function submit() {
    if (!secret.trim()) return;
    setError('');
    try {
      await submitWord(code, uid, secret.trim());
      setSecret('');
    } catch (e) { fail(e); }
  }

  // The host submits on behalf of any player added without a phone.
  async function submitForLocal(targetUid: string) {
    const word = localSecrets[targetUid]?.trim();
    if (!word) return;
    setError('');
    try {
      await submitWord(code, targetUid, word);
      setLocalSecrets((s) => ({ ...s, [targetUid]: '' }));
    } catch (e) { fail(e); }
  }

  async function changeTheme(next: string) {
    if (!isHost) return;
    try { await saveTheme(code, uid, next); } catch (e) { fail(e); }
  }

  async function toggleTimer() {
    if (!room || !isHost) return;
    try { await saveTimerOff(code, uid, !room.settings?.timerOff); } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leaveEmpireRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/empire'); setScreen('choose');
  }

  async function kick(id: string) {
    if (!isHost) return;
    try { await kickPlayer(code, uid, id); } catch (e) { fail(e); }
  }

  async function start() {
    setError('');
    try { await beginReveal(code, uid); } catch (e) { fail(e); }
  }

  function endReveal() {
    hideReveal(code, uid).catch((e) => fail(e));
  }

  async function doCapture(a: string, b: string) {
    if (!room) return;
    setError('');
    try {
      const before = room.players || {};
      const record = recordCapture(a, b, before);
      const players = capture(before, a, b);
      const win = winner(players);
      await savePlayers(code, uid, players, win ? 'finished' : undefined, record);
    } catch (e) { fail(e); }
  }

  async function doUndoCapture() {
    if (!room?.settings?.lastCapture) return;
    setError('');
    try {
      const players = undoCapture(room.players || {}, room.settings.lastCapture);
      await savePlayers(code, uid, players, 'playing', null);
    } catch (e) { fail(e); }
  }

  /** General correction, not limited to the most recent capture, for fixing a mistake made at any earlier point in the game. */
  async function doFixStatus(playerId: string, newLeaderId: string | null) {
    if (!room) return;
    setError('');
    try {
      const players = setPlayerStatus(room.players || {}, playerId, newLeaderId);
      const win = winner(players);
      await savePlayers(code, uid, players, win ? 'finished' : 'playing', null);
    } catch (e) { fail(e); }
  }

  const share = code ? `${location.origin}/housegames/empire/${code}` : '';
  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Empire</Link>
      <button className="help-button" onClick={() => setHelpOpen(true)}>Help</button>
    </header>
  );
  const Help = helpOpen && (
    <div className="help-backdrop" role="dialog" aria-modal="true" aria-label="How to play">
      <section className="help-panel">
        <button className="help-close" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button>
        <div className="hg-eyebrow">How to play</div>
        <h2>Build your empire.</h2>
        <ol>
          <li><b>Join and choose.</b> Enter a private word that fits the room theme.</li>
          <li><b>Reveal.</b> The host sees the full list, on a timer unless the room turns it off, and can bring it back later.</li>
          <li><b>Guess aloud.</b> On your turn, name a player and the word you think they chose.</li>
          <li><b>Capture.</b> A correct guess brings that player and their whole empire into yours.</li>
          <li><b>Win.</b> The last uncaptured leader rules the empire.</li>
        </ol>
        <p>The host keeps the game moving, checks the private identity key, and records correct captures in the app.</p>
        <Button onClick={() => setHelpOpen(false)}>Got it</Button>
      </section>
    </div>
  );

  if (screen === 'choose') {
    return (
      <main>
        {Header}
        <section className="hero">
          <div className="crown">♜</div>
          <div className="hg-eyebrow">The social memory game</div>
          <h1 className="hg-headline">Build your<br /><em>Empire.</em></h1>
          <p className="hg-lead">Choose a secret identity. Remember the list. Guess your friends. Rule the room.</p>
          <div className="actions">
            <Button onClick={() => setScreen('setup')}>Host a game</Button>
            <Button ghost onClick={() => setScreen('joinForm')}>Join with code</Button>
          </div>
        </section>
        {Help}
      </main>
    );
  }

  if (screen === 'setup') {
    return (
      <main>
        {Header}
        <Card>
          <button className="hg-back" onClick={() => setScreen('choose')}>← Back</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Host a game</h2>
          <Field label="Secret category">
            <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Cities" />
          </Field>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0', fontSize: 13 }}>
            Reveal timer
            <button type="button" className={'toggle-timer' + (timerOn ? ' on' : '')} onClick={() => setTimerOn((v) => !v)}>{timerOn ? 'On' : 'Off'}</button>
          </label>
          {timerOn && (
            <label style={{ display: 'block', fontSize: 13, margin: '22px 0' }}>
              Reveal time <b>{duration} seconds</b>
              <input type="range" min={15} max={60} step={5} value={duration} onChange={(e) => setDuration(+e.target.value)} style={{ width: '100%', accentColor: 'var(--hg-rust)' }} />
            </label>
          )}
          <Button wide onClick={host} style={{ marginTop: 10 }}>Create room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
        {Help}
      </main>
    );
  }

  if (screen === 'joinForm') {
    return (
      <main>
        {Header}
        <Card>
          <button className="hg-back" onClick={() => setScreen('choose')}>← Back</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join a room</h2>
          <Field label="Room code">
            <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC234" maxLength={CODE_LENGTH} />
          </Field>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join game</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
        {Help}
      </main>
    );
  }

  // screen === 'room'
  if (!room) {
    return (
      <main>
        {Header}
        <div className="loader">Joining {code}…</div>
        <ErrorText>{error}</ErrorText>
        {Help}
      </main>
    );
  }

  // Arrived via a shared link but haven't joined yet.
  if (!room.players?.[uid]) {
    return (
      <main>
        {Header}
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join this empire?</h2>
          <p className="hg-note">{Object.keys(room.players || {}).length} player(s) already in.</p>
          <Button wide onClick={() => joinWithCode(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
        {Help}
      </main>
    );
  }

  if (room.phase === 'reveal') {
    if (isHost && reveal) {
      const timerLive = reveal.endsAt > 0;
      const left = Math.ceil(remainingMs(reveal.endsAt, now) / 1000);
      return (
        <main>
          {Header}
          <section className="reveal-phase">
            {timerLive ? <div className="timer-big">{left}</div> : <p className="timer-off-note">Timer off. Hide the list when you're done.</p>}
            <p>Only you can see this list</p>
            <div className="word-grid">{reveal.words.map((w, i) => <span key={`${w}_${i}`}>{w}</span>)}</div>
            <Button ghost onClick={endReveal}>Hide now</Button>
          </section>
          {Help}
        </main>
      );
    }
    if (isHost) return <main>{Header}<div className="loader">Preparing the list…</div><ErrorText>{error}</ErrorText>{Help}</main>;
    return (
      <main>
        {Header}
        <section className="reveal-phase">
          <div className="hg-eyebrow">Room {code}</div>
          <h2>The host has the list.</h2>
          <p className="reveal-note">Only the host can see it. Sit tight.</p>
        </section>
        {Help}
      </main>
    );
  }

  if (room.phase === 'playing' || room.phase === 'finished') {
    const players = room.players || {};
    const alive = Object.values(players).filter((p) => p && p.id && p.name && !p.eliminated);
    const win = winner(players);
    return (
      <main>
        {Header}
        <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
        <Board
          players={players}
          alive={alive}
          win={win}
          isHost={isHost}
          code={code}
          words={words}
          timerOff={Boolean(room.settings?.timerOff)}
          lastCapture={room.settings?.lastCapture ?? null}
          onCapture={doCapture}
          onUndoCapture={doUndoCapture}
          onFixStatus={doFixStatus}
          onRevealAgain={start}
          onToggleTimer={toggleTimer}
        />
        <ErrorText>{error}</ErrorText>
        {Help}
      </main>
    );
  }

  // lobby
  const players = Object.values(room.players || {}).filter((p) => p && p.id && p.name);
  const readyCount = players.filter((p) => p.submitted).length;
  const everyoneReady = players.length > 0 && readyCount === players.length;
  return (
    <main>
      {Header}
      <section className="lobby">
        <div className="leave-row"><Button onClick={leave}>Leave room</Button></div>
        <RoomHeader gameLabel="Empire" code={code} shareUrl={share} />
        <PlayerManager
          players={players}
          hostId={room.hostId}
          isHost={isHost}
          onMakeHost={(target) => makeHost('empire', code, uid, target).catch(fail)}
          onRemove={(target) => kick(target)}
          onAddLocal={(n) => addLocalPlayer('empire', code, uid, n, mk).catch(fail)}
        />
        <div className="lobby-grid">
          <div>
            <h3>Players <b>{players.length}</b></h3>
            {players.map((p) => (
              <div className="player-row" key={p.id}>
                <i>{p.name[0]}</i>
                <span>{p.name}{p.id === room.hostId && <small> Host</small>}</span>
                <em className={p.submitted ? 'ready' : ''}>{p.submitted ? 'Ready' : 'Choosing…'}</em>
                {isHost && p.id !== room.hostId && <button className="remove" onClick={() => kick(p.id)}>Remove</button>}
              </div>
            ))}
          </div>
          <div className="secret">
            <div className="secret-theme">
              <b>Theme</b>
              {isHost ? (
                <div className="theme-edit">
                  <input aria-label="Room theme" value={themeDraft} onChange={(e) => setThemeDraft(e.target.value)} />
                  <button className="mini" disabled={!themeDraft.trim() || themeDraft === room.settings?.category} onClick={() => changeTheme(themeDraft.trim())}>Save</button>
                </div>
              ) : <span>{room.settings?.category}</span>}
            </div>
            <p>Choose your secret word</p>
            <small>Pick a word that fits the theme. Only the host will see who submitted it.</small>
            {room.players?.[uid]?.submitted ? (
              <>
                <div className="sealed">✓ Word submitted</div>
                <small>Your word is private until the reveal.</small>
              </>
            ) : (
              <>
                <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="" />
                <Button wide onClick={submit}>Submit my word</Button>
              </>
            )}
            {isHost && players.filter((p) => p.id.startsWith('local-') && !p.submitted).map((p) => (
              <div key={p.id} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hg-border)' }}>
                <small>Submit for {p.name} (no phone)</small>
                <input
                  value={localSecrets[p.id] ?? ''}
                  onChange={(e) => setLocalSecrets((s) => ({ ...s, [p.id]: e.target.value }))}
                  placeholder=""
                />
                <Button wide onClick={() => submitForLocal(p.id)}>Submit for {p.name}</Button>
              </div>
            ))}
          </div>
        </div>
        {isHost && (
          <div className="hostbar">
            <span>{readyCount}/{players.length} ready</span>
            <Button disabled={!everyoneReady} onClick={start}>Reveal the list</Button>
          </div>
        )}
        {isHost && readyCount < players.length && <p className="hint">Everyone needs a word in before the reveal.</p>}
        <ErrorText>{error}</ErrorText>
      </section>
      {Help}
    </main>
  );
}

/** General correction tool: fixes any player's status regardless of how long ago the mistake happened, unlike the one-step "undo last capture" above it. */
function FixStatusPanel({ players, onFixStatus }: { players: Record<string, Player>; onFixStatus: (playerId: string, newLeaderId: string | null) => void }) {
  const all = Object.values(players).filter((p) => p && p.id && p.name);
  const [playerId, setPlayerId] = useState(all[0]?.id || '');
  const [target, setTarget] = useState('independent');
  const leaders = all.filter((p) => !p.eliminated && p.id !== playerId);
  return (
    <div className="fix-status">
      <select value={playerId} onChange={(e) => { setPlayerId(e.target.value); setTarget('independent'); }}>
        {all.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.eliminated ? 'captured' : 'leader'})</option>)}
      </select>
      <span>should be</span>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="independent">Independent leader</option>
        {leaders.map((p) => <option key={p.id} value={p.id}>Captured by {p.name}</option>)}
      </select>
      <Button small onClick={() => onFixStatus(playerId, target === 'independent' ? null : target)}>Apply fix</Button>
    </div>
  );
}

function Board({
  players, alive, win, isHost, code, words, timerOff, lastCapture, onCapture, onUndoCapture, onFixStatus, onRevealAgain, onToggleTimer,
}: {
  players: Record<string, Player>;
  alive: Player[];
  win: Player | null;
  isHost: boolean;
  code: string;
  words: Record<string, { word: string }>;
  timerOff: boolean;
  lastCapture: CaptureRecord | null;
  onCapture: (a: string, b: string) => void;
  onUndoCapture: () => void;
  onFixStatus: (playerId: string, newLeaderId: string | null) => void;
  onRevealAgain: () => void;
  onToggleTimer: () => void;
}) {
  const [a, setA] = useState(alive[0]?.id || '');
  const [b, setB] = useState(alive[1]?.id || '');
  return (
    <section className="board">
      <div className="hg-eyebrow">Room {code} · Game on</div>
      <h2>{win ? `${win.name} rules the empire.` : 'Who remembers who?'}</h2>
      <p className="muted">Guess aloud. The host records a correct capture; the losing empire moves as one.</p>
      {isHost && (
        <details className="identity-key">
          <summary>Host identity key</summary>
          {Object.entries(words).map(([id, s]) => (
            <div className="row" key={id}><span>{s.word}</span><b>{players[id]?.name || 'Player left'}</b></div>
          ))}
        </details>
      )}
      <EmpireMap players={players} />
      {isHost && !win && alive.length >= 2 && (
        <div className="capture">
          <select value={a} onChange={(e) => setA(e.target.value)}>{alive.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <span>captured</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>{alive.map((p) => <option key={p.id} value={p.id}>{words[p.id]?.word || p.name}</option>)}</select>
          <Button disabled={!a || !b || a === b} onClick={() => onCapture(a, b)}>Record</Button>
        </div>
      )}
      {isHost && lastCapture && (
        <div className="undo-capture">
          <span>Last: {players[lastCapture.attackerId]?.name || 'Someone'} captured {players[lastCapture.targetId]?.name || 'someone'}</span>
          <Button ghost small onClick={onUndoCapture}>Undo that</Button>
        </div>
      )}
      {isHost && (
        <details className="identity-key">
          <summary>Fix a mistake on the map</summary>
          <p className="hg-note" style={{ marginTop: 10 }}>Made an error earlier in the game, not just the last capture? Set anyone's status directly.</p>
          <FixStatusPanel players={players} onFixStatus={onFixStatus} />
        </details>
      )}
      {isHost && !win && <Button ghost className="reveal-again" onClick={onRevealAgain}>Reveal the list again</Button>}
      {isHost && <button className="toggle-timer board-timer" onClick={onToggleTimer}>Reveal timer: {timerOff ? 'off' : 'on'}</button>}
    </section>
  );
}

function EmpireMap({ players }: { players: Record<string, Player> }) {
  const leaders = Object.values(players).filter((p) => p && p.id && p.name && !p.eliminated);
  return (
    <section className="empire-map" aria-label="Live empire map">
      <div className="map-heading">
        <div>
          <p className="map-kicker">Live board</p>
          <h3>Empire map</h3>
        </div>
        <span><i /> Updates for everyone</span>
      </div>
      <p className="map-help">Each leader starts alone. Captured players branch beneath the empire they joined.</p>
      <div className="empire-grove">
        {leaders.map((leader, index) => {
          const members = (leader.members || []).map((id) => players[id]).filter(Boolean);
          return (
            <article className="empire-tree" key={leader.id} style={{ '--tree-accent': `var(--tree-${index % 5})` } as React.CSSProperties}>
              <div className="leader-node">
                <i>{leader.name[0]}</i>
                <div><strong>{leader.name}</strong><small>{members.length ? `Leads ${members.length + 1}` : 'Independent'}</small></div>
              </div>
              {members.length > 0 && (
                <div className="tree-branches">
                  {members.map((member, memberIndex) => (
                    <div className="member-branch" key={member.id}>
                      <span className="branch-line" />
                      <div className="member-node">
                        <i>{member.name[0]}</i>
                        <span>{member.name}</span>
                        <small>{memberIndex === 0 ? 'Captured' : 'In empire'}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
