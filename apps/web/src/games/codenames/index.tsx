import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, Field, TextInput, ErrorText, PlayerList, useToast, RoomHeader, PlayerManager,
} from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode, makeHost, addLocalPlayer } from '@fb/index';
import {
  createCNRoom, joinCNRoom, watchCNRoom, joinTeam, becomeSpymaster, startCNGame, giveClue,
  queueGuess, resolveGuess, clearGuessVote, watchGuessVotes, endTurn, leaveCNRoom, watchMyKey,
  kickCNPlayer, type CNRoom, type CNKeySecret, type CNPlayer,
} from './firebase';
import type { TeamColor } from './game';
import './codenames.css';

const CODE_LENGTH = 5;

export default function CodenamesGame() {
  return (
    <div className="cn">
      <RequireIdentity>{(identity) => <CNApp uid={identity.uid} name={identity.name} />}</RequireIdentity>
    </div>
  );
}

function CNApp({ uid, name }: { uid: string; name: string }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'joinForm' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<CNRoom | null>(null);
  const [error, setError] = useState('');
  const [key, setKey] = useState<CNKeySecret | null>(null);
  const [localSpyKey, setLocalSpyKey] = useState<CNKeySecret | null>(null);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [clueWord, setClueWord] = useState('');
  const [clueNumber, setClueNumber] = useState(1);

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const share = code ? `${location.origin}/housegames/codenames/${code}` : '';

  // A spymaster added as a local (phoneless) player has no session of their
  // own, so the host's client watches that player's key directly, the host
  // already has standing read access to any player's secret (see secrets.ts).
  const currentSpymasterUid = room ? (room.settings.turn === 'red' ? room.settings.redSpymaster : room.settings.blueSpymaster) : null;
  const hostControllingLocalSpymaster = isHost && Boolean(currentSpymasterUid?.startsWith('local-'));

  useEffect(() => {
    if (hostControllingLocalSpymaster && currentSpymasterUid && code) return watchMyKey(code, currentSpymasterUid, setLocalSpyKey);
    setLocalSpyKey(null);
  }, [hostControllingLocalSpymaster, currentSpymasterUid, code]);

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchCNRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => { if (code) return watchMyKey(code, uid, setKey); }, [code, uid]);
  useEffect(() => { if (code) return watchGuessVotes(code, setVotes); }, [code]);

  // Host resolves queued guesses one at a time.
  useEffect(() => {
    if (!isHost || !room || room.phase !== 'guessing') return;
    const entry = Object.entries(votes)[0];
    if (!entry) return;
    const [voterUid, indexStr] = entry;
    clearGuessVote(code, voterUid).then(() => resolveGuess(code, uid, Number(indexStr))).catch(() => {});
  }, [isHost, room, votes, code, uid]);

  async function host() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try { await createCNRoom(c, uid, name); setCode(c); nav(`/codenames/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  async function joinWithCode(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError("That room code doesn't look right");
    setError('');
    try { await joinCNRoom(c, uid, name); setCode(c); nav(`/codenames/${c}`); setScreen('room'); } catch (e) { fail(e); }
  }
  function leave() {
    if (room?.players?.[uid]) leaveCNRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/codenames'); setScreen('choose');
  }

  const Header = (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between' }}>
      <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit', textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 12 }}>Codenames</Link>
      {code && <Button small ghost onClick={leave}>Leave</Button>}
    </header>
  );

  if (screen === 'choose') {
    return (
      <main>{Header}
        <section className="hero">
          <div className="hg-eyebrow">One word. One number. A whole team.</div>
          <h1 className="hg-headline">Code<em>names.</em></h1>
          <p className="hg-lead">Give your team one-word clues to find your agents on the board before the other team, or the assassin.</p>
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
  const redTeam = players.filter((p) => p.team === 'red');
  const blueTeam = players.filter((p) => p.team === 'blue');
  const me = room.players[uid];
  const isSpymaster = me?.spymaster && me.team === room.settings.turn;

  if (room.phase === 'lobby') {
    return (
      <main>{Header}
        <Card>
          <RoomHeader gameLabel="Codenames" code={code} shareUrl={share} />
          <PlayerManager
            players={players}
            hostId={room.hostId}
            isHost={isHost}
            onMakeHost={(targetUid) => makeHost('codenames', code, uid, targetUid).catch(fail)}
            onRemove={(targetUid) => kickCNPlayer(code, uid, targetUid).catch(fail)}
            onAddLocal={(localName) => addLocalPlayer<CNPlayer>('codenames', code, uid, localName, (id, n) => ({ id, name: n, team: null, spymaster: false })).catch(fail)}
          />
          <h2>Pick a team</h2>
          <div className="team-pick">
            <div className="team-card red">
              <h3>Red ({redTeam.length})</h3>
              {redTeam.map((p) => <div key={p.id}>{p.name}{p.spymaster ? ' 🕵️' : ''}</div>)}
              <Button small onClick={() => joinTeam(code, uid, 'red').catch(fail)} style={{ marginTop: 10 }}>Join Red</Button>
              {!room.settings.redSpymaster && me?.team === 'red' && <Button small ghost onClick={() => becomeSpymaster(code, room.hostId, uid, 'red').catch(fail)} style={{ marginTop: 6 }}>Be Spymaster</Button>}
            </div>
            <div className="team-card blue">
              <h3>Blue ({blueTeam.length})</h3>
              {blueTeam.map((p) => <div key={p.id}>{p.name}{p.spymaster ? ' 🕵️' : ''}</div>)}
              <Button small onClick={() => joinTeam(code, uid, 'blue').catch(fail)} style={{ marginTop: 10 }}>Join Blue</Button>
              {!room.settings.blueSpymaster && me?.team === 'blue' && <Button small ghost onClick={() => becomeSpymaster(code, room.hostId, uid, 'blue').catch(fail)} style={{ marginTop: 6 }}>Be Spymaster</Button>}
            </div>
          </div>
          {isHost && (
            <Button wide disabled={!room.settings.redSpymaster || !room.settings.blueSpymaster || players.length < 4} onClick={() => startCNGame(code, uid).catch(fail)}>
              Start game
            </Button>
          )}
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const canSeeKey = isSpymaster || hostControllingLocalSpymaster;
  const effectiveKey = isSpymaster ? key : localSpyKey;

  const Board = (
    <div className="board">
      {room.settings.words.map((word, i) => {
        const revealed = room.settings.revealed[i];
        const revealedColor = room.settings.revealedColors[i];
        const spyColor = canSeeKey && effectiveKey && !revealed ? effectiveKey.key[i] : null;
        const cls = ['cell', revealed && revealedColor && `revealed ${revealedColor}`, spyColor && `spy-${spyColor}`].filter(Boolean).join(' ');
        return (
          <button
            key={word}
            className={cls}
            onClick={() => {
              if (revealed || room.phase !== 'guessing' || me?.spymaster) return;
              queueGuess(code, uid, i).catch(fail);
            }}
          >
            {word}
          </button>
        );
      })}
    </div>
  );

  return (
    <main>{Header}
      <section style={{ maxWidth: 900, margin: '4vh auto', padding: '0 18px' }}>
        <div className="status-row">
          <div className="hg-eyebrow">Room {code} · {room.settings.turn.toUpperCase()}'s turn</div>
          <span className="hg-note">Red left: {room.settings.redRemaining} · Blue left: {room.settings.blueRemaining}</span>
        </div>

        {room.phase === 'gameOver' ? (
          <Card>
            <h2>{room.settings.winner?.toUpperCase()} wins!</h2>
            <Button onClick={leave}>Back to lobby list</Button>
          </Card>
        ) : (
          <>
            {room.settings.clueWord && <p className="hg-note">Clue: <b>{room.settings.clueWord}</b> ({room.settings.clueNumber}), {room.settings.guessesLeft} guesses left</p>}
            {Board}
            {(isSpymaster || hostControllingLocalSpymaster) && room.phase === 'clue' && (
              <div className="clue-form">
                {hostControllingLocalSpymaster && <p className="hg-note">Giving the clue for {players.find((p) => p.id === currentSpymasterUid)?.name}.</p>}
                <TextInput placeholder="Clue word" value={clueWord} onChange={(e) => setClueWord(e.target.value)} />
                <input type="number" min={0} max={9} value={clueNumber} onChange={(e) => setClueNumber(+e.target.value)} />
                <Button disabled={!clueWord.trim()} onClick={() => giveClue(code, room.hostId, clueWord.trim(), clueNumber).then(() => setClueWord(''))}>Give clue</Button>
              </div>
            )}
            {me?.team === room.settings.turn && !me?.spymaster && room.phase === 'guessing' && (
              <Button ghost onClick={() => endTurn(code, room.hostId).catch(fail)}>End turn</Button>
            )}
          </>
        )}

        <details style={{ marginTop: 20 }}><summary>Players</summary><PlayerList players={players} hostId={room.hostId} /></details>
        <ErrorText>{error}</ErrorText>
      </section>
    </main>
  );
}
