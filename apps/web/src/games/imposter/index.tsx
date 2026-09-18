import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Button, Card, Field, TextInput, ErrorText, QR, ChipRow, Segmented, Stepper,
  RevealCard, HoldToReveal, VoteGrid, useToast,
} from '@ui/index';
import { RequireIdentity } from '../../auth/RequireIdentity';
import { randomRoomCode, isValidRoomCode } from '@fb/index';
import {
  createImposterRoom, joinImposterRoom, watchImposterRoom, watchMySecret, saveImposterSettings,
  setReady, setClue, castVote, clearVotes, leaveImposterRoom, getRoomOnce, dealSecrets,
  getAllImposterSecrets, setRoomPhase, type ImposterRoom,
} from './firebase';
import {
  CATS, CAT_NAMES, WORD_COUNT, defaultCats, imposterMax, guessMatches, makeHint, pickWord,
  shuffle, type Secret, type Player, type HintLevel, type ImposterSettings,
} from './game';
import './imposter.css';

const CODE_LENGTH = 5;
const HINT_OPTS = [
  { value: 'off' as HintLevel, label: 'Off' },
  { value: 'okay' as HintLevel, label: 'Okay' },
  { value: 'good' as HintLevel, label: 'Good' },
  { value: 'great' as HintLevel, label: 'Great' },
];

export default function ImposterGame() {
  const { code: urlCode } = useParams();
  const [mode, setMode] = useState<'home' | 'local' | 'online'>(urlCode ? 'online' : 'home');

  return (
    <div className="ig">
      {mode === 'home' && <Home onLocal={() => setMode('local')} onOnline={() => setMode('online')} />}
      {mode === 'local' && <LocalGame onExit={() => setMode('home')} />}
      {mode === 'online' && (
        <RequireIdentity>{(identity) => <OnlineGame uid={identity.uid} name={identity.name} onExit={() => setMode('home')} />}</RequireIdentity>
      )}
    </div>
  );
}

function Header({ onHome }: { onHome: () => void }) {
  return (
    <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <button onClick={onHome} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em', fontSize: 13 }}>Imposter</button>
      <Link to="/" className="hg-note" style={{ textDecoration: 'none' }}>All games</Link>
    </header>
  );
}

function Home({ onLocal, onOnline }: { onLocal: () => void; onOnline: () => void }) {
  return (
    <main>
      <Header onHome={() => {}} />
      <section className="hero">
        <div className="spy">🕵️</div>
        <div className="hg-eyebrow">Social bluffing</div>
        <h1 className="hg-headline"><em>Imposter</em></h1>
        <p className="hg-lead">Everyone gets the same secret word except the imposter. Give clues, call out the bluff, vote them out.</p>
        <div className="actions">
          <Button onClick={onLocal}>Pass &amp; Play</Button>
          <Button ghost onClick={onOnline}>Create online room</Button>
        </div>
        <p className="hg-note" style={{ marginTop: 18 }}>{WORD_COUNT.toLocaleString()}+ words · {CAT_NAMES.length} categories · hint levels · pass-and-play or online rooms</p>
      </section>
    </main>
  );
}

/* ============================= LOCAL (pass & play) ============================= */

type LocalPlayer = { id: string; name: string };
type LocalAssign = Record<string, Secret>;
type LocalState = {
  players: LocalPlayer[];
  cats: string[];
  imposters: number;
  hint: HintLevel;
  used: Record<string, string[]>;
  round: number;
  assign: LocalAssign | null;
  word: string;
  cat: string;
  revealIdx: number;
  accusedId: string | null;
  outcome: '' | 'imposter' | 'crew' | 'steal';
  guess: string;
};

function freshLocal(): LocalState {
  return { players: [], cats: defaultCats(), imposters: 1, hint: 'okay', used: {}, round: 0, assign: null, word: '', cat: '', revealIdx: 0, accusedId: null, outcome: '', guess: '' };
}

function LocalGame({ onExit }: { onExit: () => void }) {
  const [L, setL] = useState<LocalState>(freshLocal);
  const [screen, setScreen] = useState<'setup' | 'reveal' | 'discuss' | 'vote' | 'guess' | 'result'>('setup');
  const [nameDraft, setNameDraft] = useState('');
  const [guessDraft, setGuessDraft] = useState('');
  const toast = useToast();

  function addPlayer(name: string) {
    const n = name.trim();
    if (!n) return;
    if (L.players.length >= 20) { toast('Max 20 players'); return; }
    if (L.players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { toast('That name is taken'); return; }
    setL((s) => ({ ...s, players: [...s.players, { id: 'p' + Math.random().toString(36).slice(2, 9), name: n }] }));
    setNameDraft('');
  }

  function startRound() {
    if (L.players.length < 3) { toast('Need at least 3 players'); return; }
    if (L.cats.length === 0) { toast('Pick a category'); return; }
    const imposters = Math.min(Math.max(1, L.imposters), imposterMax(L.players.length));
    const w = pickWord(L.cats, L.used);
    const impIds = new Set(shuffle(L.players).slice(0, imposters).map((p) => p.id));
    const assign: LocalAssign = {};
    for (const p of L.players) {
      assign[p.id] = impIds.has(p.id)
        ? { role: 'imposter', hint: L.hint === 'off' ? '' : makeHint(L.hint, w.cat, w.word) }
        : { role: 'crew', word: w.word };
    }
    setL((s) => ({ ...s, imposters, word: w.word, cat: w.cat, used: w.usedWords, round: s.round + 1, assign, revealIdx: 0, accusedId: null, outcome: '', guess: '' }));
    setScreen('reveal');
  }

  if (screen === 'setup') {
    const n = L.players.length;
    const maxI = imposterMax(Math.max(n, 2));
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <button className="hg-back" onClick={onExit}>← Back</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Pass &amp; Play</h2>
          <p className="hg-note" style={{ marginTop: 0 }}>One phone, passed around. Everyone peeks at their card in secret.</p>
          <h3>Players ({n})</h3>
          <div className="plist">
            {L.players.map((p) => (
              <div className="player-row" key={p.id}>
                <i>{p.name.charAt(0).toUpperCase()}</i>
                <span>{p.name}</span>
                <button className="x" onClick={() => setL((s) => ({ ...s, players: s.players.filter((x) => x.id !== p.id) }))}>×</button>
              </div>
            ))}
            {n === 0 && <p className="hg-note">Add at least 3 players.</p>}
          </div>
          <div className="row">
            <TextInput value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Add a name" maxLength={20} onKeyDown={(e) => e.key === 'Enter' && addPlayer(nameDraft)} />
            <button className="mini" onClick={() => addPlayer(nameDraft)}>Add</button>
          </div>
          <h3>Categories ({L.cats.length} picked)</h3>
          <ChipRow options={CAT_NAMES} value={L.cats} multi onChange={(cats) => setL((s) => ({ ...s, cats }))} />
          <h3>Imposters</h3>
          <Stepper value={Math.min(L.imposters, maxI)} min={1} max={maxI} onChange={(v) => setL((s) => ({ ...s, imposters: v }))} />
          <h3>Imposter hint</h3>
          <Segmented options={HINT_OPTS} value={L.hint} onChange={(hint) => setL((s) => ({ ...s, hint }))} />
          <p className="hg-note">Okay = broad type · Good = category · Great = category + first letter + length</p>
          <Button wide disabled={n < 3 || L.cats.length === 0} onClick={startRound} style={{ marginTop: 18 }}>Start round</Button>
        </Card>
      </main>
    );
  }

  if (screen === 'reveal') {
    const p = L.players[L.revealIdx];
    const secret = L.assign![p.id];
    return (
      <main>
        <Header onHome={onExit} />
        <section className="revealcard-wrap" style={{ width: 'min(480px,calc(100% - 32px))', margin: '8vh auto' }}>
          <div className="hg-eyebrow" style={{ textAlign: 'center' }}>Pass the phone to</div>
          <h2 style={{ textAlign: 'center', fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{p.name}</h2>
          <p className="hg-note" style={{ textAlign: 'center' }}>Press and hold to see your card. Don't let anyone else see.</p>
          <HoldToReveal
            hidden={<button className="hg-btn hg-wide" style={{ marginTop: 22 }}>Hold to reveal</button>}
            revealed={
              <RevealCard
                word={secret.role === 'crew' ? secret.word : undefined}
                role={secret.role === 'imposter' ? 'You are the IMPOSTER' : undefined}
              />
            }
          />
          {secret.role === 'imposter' && secret.hint && <p className="hg-note" style={{ textAlign: 'center', marginTop: 10 }}>Hint: {secret.hint}</p>}
          <Button ghost wide style={{ marginTop: 22 }} onClick={() => {
            if (L.revealIdx < L.players.length - 1) setL((s) => ({ ...s, revealIdx: s.revealIdx + 1 }));
            else setScreen('discuss');
          }}
          >
            {L.revealIdx < L.players.length - 1 ? 'Hide, pass to next player' : 'Hide, start discussing'}
          </Button>
          <p className="hg-note" style={{ textAlign: 'center', marginTop: 14 }}>{L.revealIdx + 1} of {L.players.length}</p>
        </section>
      </main>
    );
  }

  if (screen === 'discuss') {
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Everyone's in.</h2>
            <p className="hg-lead" style={{ margin: '14px auto' }}>Take turns giving a one-word clue about the secret word. Then discuss and find the fake.</p>
            <p className="hg-note">{L.imposters} imposter{L.imposters > 1 ? 's' : ''} among you · hints {L.hint === 'off' ? 'off' : L.hint}</p>
            <Button wide onClick={() => setScreen('vote')}>Time to vote</Button>
          </div>
        </Card>
      </main>
    );
  }

  if (screen === 'vote') {
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Who's the imposter?</h2>
          <p className="hg-note">Point, argue, then tap your prime suspect.</p>
          <VoteGrid players={L.players} onVote={(id) => {
            const role = L.assign![id].role;
            setL((s) => ({ ...s, accusedId: id, outcome: role === 'imposter' ? '' : 'imposter' }));
            setScreen(role === 'imposter' ? 'guess' : 'result');
          }}
          />
        </Card>
      </main>
    );
  }

  if (screen === 'guess') {
    const accused = L.players.find((p) => p.id === L.accusedId)!;
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <div style={{ textAlign: 'center' }}>
            <p className="win" style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic', fontSize: 32 }}>{accused.name} was the imposter!</p>
            <p className="hg-lead" style={{ margin: '10px auto' }}>But a caught imposter gets one shot: hand them the phone, guess the secret word to steal the win.</p>
            <div className="row">
              <TextInput value={guessDraft} onChange={(e) => setGuessDraft(e.target.value)} placeholder="Guess the word" onKeyDown={(e) => e.key === 'Enter' && submitGuess()} />
              <button className="mini" onClick={submitGuess}>Guess</button>
            </div>
            <Button ghost wide style={{ marginTop: 12 }} onClick={() => { setL((s) => ({ ...s, outcome: 'crew', guess: '' })); setScreen('result'); }}>Skip the guess</Button>
          </div>
        </Card>
      </main>
    );
  }

  function submitGuess() {
    const outcome = guessMatches(guessDraft, L.word) ? 'steal' : 'crew';
    setL((s) => ({ ...s, guess: guessDraft.trim(), outcome }));
    setGuessDraft('');
    setScreen('result');
  }

  // result
  const imps = L.players.filter((p) => L.assign![p.id].role === 'imposter');
  const accused = L.players.find((p) => p.id === L.accusedId);
  const verdict = L.outcome === 'crew' ? 'The group wins!' : L.outcome === 'steal' ? 'The imposter steals it!' : 'The imposter survives!';
  const cls = L.outcome === 'crew' ? 'win' : 'lose';
  return (
    <main>
      <Header onHome={onExit} />
      <Card>
        <div className="resultcard">
          <p className={'verdict ' + cls}>{verdict}</p>
          <p className="hg-lead" style={{ margin: '8px auto' }}>
            {L.outcome === 'crew' && `${accused?.name ?? ''} was caught${L.guess ? ` and guessed "${L.guess}", wrong.` : '.'}`}
            {L.outcome === 'steal' && `${accused?.name ?? ''} was caught… then guessed the word. Brutal.`}
            {L.outcome === 'imposter' && `${accused?.name ?? ''} was innocent.`}
          </p>
          <div className="panel">
            <p className="hg-note" style={{ margin: 0 }}>The word was</p>
            <p style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic', fontSize: 40, margin: '6px 0', color: 'var(--hg-rust)' }}>{L.word}</p>
            <p className="hg-note">Imposter{imps.length > 1 ? 's' : ''}: <b>{imps.map((p) => p.name).join(', ')}</b></p>
          </div>
          <Button wide onClick={startRound}>Play again (new word)</Button>
          <Button ghost wide style={{ marginTop: 10 }} onClick={() => setScreen('setup')}>Change setup</Button>
        </div>
      </Card>
    </main>
  );
}

/* ============================= ONLINE ============================= */

function OnlineGame({ uid, name, onExit }: { uid: string; name: string; onExit: () => void }) {
  const nav = useNavigate();
  const { code: urlCode } = useParams();
  const toast = useToast();
  const startCode = urlCode && isValidRoomCode(urlCode.toUpperCase(), CODE_LENGTH) ? urlCode.toUpperCase() : '';

  const [screen, setScreen] = useState<'choose' | 'hostSetup' | 'join' | 'room'>(startCode ? 'room' : 'choose');
  const [code, setCode] = useState(startCode);
  const [room, setRoom] = useState<ImposterRoom | null>(null);
  const [secret, setSecretState] = useState<Secret | null>(null);
  const [error, setError] = useState('');
  const [clueDraft, setClueDraft] = useState('');
  const [guessDraft, setGuessDraft] = useState('');
  const [showCard, setShowCard] = useState(false);
  const tallying = useRef(false);

  const isHost = room?.hostId === uid;
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchImposterRoom(code, (r) => { setRoom(r); if (!r) setError('Room not found'); }, setError);
  }, [screen, code]);

  useEffect(() => {
    if (screen !== 'room' || !code) return;
    return watchMySecret(code, uid, setSecretState);
  }, [screen, code, uid]);

  // Host-only reactive vote tally, runs whenever we're in vote phase and all votes are in.
  useEffect(() => {
    if (!isHost || room?.phase !== 'vote' || !code || !room) return;
    const players = Object.values(room.players || {});
    const votes = room.votes || {};
    const ids = Object.keys(votes).filter((v) => players.some((p) => p.id === v));
    if (ids.length < players.length || tallying.current) return;
    tallying.current = true;
    (async () => {
      try {
        const counts: Record<string, number> = {};
        for (const v of ids) { const t = votes[v]; if (players.some((p) => p.id === t)) counts[t] = (counts[t] || 0) + 1; }
        let max = 0; let tops: string[] = [];
        for (const t in counts) { if (counts[t] > max) { max = counts[t]; tops = [t]; } else if (counts[t] === max) tops.push(t); }
        if (tops.length !== 1) {
          await clearVotes(code);
          await saveImposterSettings(code, room.hostId, { ...room.settings, voteNote: 'Tie vote, discuss and vote again.' });
          return;
        }
        const accused = tops[0];
        const secrets = await getAllImposterSecrets(code, [accused]);
        const accSecret = secrets[accused];
        const accName = room.players[accused]?.name ?? '?';
        if (accSecret?.role === 'imposter') {
          await saveImposterSettings(code, room.hostId, { ...room.settings, voteNote: null, result: { accused, accusedName: accName, wasImposter: true } });
          await setRoomPhase(code, room.hostId, 'guess');
        } else {
          const allSecrets = await getAllImposterSecrets(code, Object.keys(room.players || {}));
          const impNames = Object.entries(allSecrets).filter(([, s]) => s.role === 'imposter').map(([id]) => room.players[id]?.name ?? '?');
          const mySecret = allSecrets[uid];
          await saveImposterSettings(code, room.hostId, {
            ...room.settings,
            voteNote: null,
            result: { accused, accusedName: accName, wasImposter: false, outcome: 'imposter', word: mySecret?.word, imposterNames: impNames },
          });
          await setRoomPhase(code, room.hostId, 'results');
        }
      } finally { tallying.current = false; }
    })();
  }, [isHost, room?.phase, room?.votes, code]);

  // Host-only reactive guess scoring once a guess is submitted.
  useEffect(() => {
    if (!isHost || room?.phase !== 'guess' || !room?.settings.guess || !code) return;
    (async () => {
      const accUid = room.settings.result?.accused;
      if (!accUid) return;
      const secrets = await getAllImposterSecrets(code, Object.keys(room.players || {}));
      const word = secrets[accUid]?.word ?? '';
      const g = room.settings.guess?.text ?? '';
      const ok = guessMatches(g, word);
      const impNames = Object.entries(secrets).filter(([, s]) => s.role === 'imposter').map(([id]) => room.players[id]?.name ?? '?');
      await saveImposterSettings(code, room.hostId, {
        ...room.settings,
        result: { ...room.settings.result!, guess: g, guessCorrect: ok, outcome: ok ? 'steal' : 'crew', word, imposterNames: impNames },
      });
      await setRoomPhase(code, room.hostId, 'results');
    })();
  }, [isHost, room?.phase, room?.settings.guess, code]);

  async function createRoomFlow() {
    setError('');
    const c = randomRoomCode(CODE_LENGTH);
    try {
      await createImposterRoom(c, uid, { id: uid, name, joinedAt: Date.now() }, { cats: defaultCats(), imposters: 1, hint: 'okay' });
      setCode(c);
      nav(`/imposter/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  async function joinRoomFlow(rawCode: string) {
    const c = rawCode.toUpperCase();
    if (!isValidRoomCode(c, CODE_LENGTH)) return setError("That room code doesn't look right");
    setError('');
    try {
      await joinImposterRoom(c, { id: uid, name, joinedAt: Date.now() });
      setCode(c);
      nav(`/imposter/${c}`);
      setScreen('room');
    } catch (e) { fail(e); }
  }

  function leave() {
    if (room?.players?.[uid]) leaveImposterRoom(code, uid).catch(() => {});
    setRoom(null); setCode(''); nav('/imposter'); setScreen('choose'); onExit();
  }

  async function hostStartRound() {
    if (!room) return;
    const players = Object.values(room.players || {});
    if (players.length < 3) { toast('Need at least 3 players'); return; }
    const st = room.settings;
    const imps = Math.min(Math.max(1, st.imposters), imposterMax(players.length));
    const w = pickWord(st.cats, st.usedWords || {});
    const impIds = new Set(shuffle(players).slice(0, imps).map((p) => p.id));
    const secretsByUid: Record<string, Secret> = {};
    for (const p of players) {
      secretsByUid[p.id] = impIds.has(p.id)
        ? { role: 'imposter', hint: st.hint === 'off' ? '' : makeHint(st.hint, w.cat, w.word) }
        : { role: 'crew', word: w.word };
    }
    try {
      await dealSecrets(code, secretsByUid);
      await saveImposterSettings(code, uid, {
        ...st, round: { num: (st.round?.num || 0) + 1, cat: w.cat }, usedWords: w.usedWords, result: null, voteNote: null, guess: null,
      });
      for (const p of players) { await setReady(code, p.id, false); await setClue(code, p.id, ''); }
      await clearVotes(code);
      await setRoomPhase(code, uid, 'card');
    } catch (e) { fail(e); }
  }

  const share = code ? `${location.origin}/housegames/imposter/${code}` : '';

  if (screen === 'choose') {
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <button className="hg-back" onClick={onExit}>← Back</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Create a room</h2>
          <p className="hg-note" style={{ marginTop: 0 }}>Everyone joins from their own phone with your link.</p>
          <Button wide onClick={createRoomFlow} style={{ marginTop: 18 }}>Create room</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  if (!room) {
    return <main><Header onHome={onExit} /><div className="loader">Joining {code}…</div><ErrorText>{error}</ErrorText></main>;
  }

  if (!room.players?.[uid]) {
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <div className="hg-eyebrow">Room {code}</div>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Join this room?</h2>
          <p className="hg-note">{Object.keys(room.players || {}).length} player(s) already in.</p>
          <Button wide onClick={() => joinRoomFlow(code)} style={{ marginTop: 18 }}>Join as {name}</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      </main>
    );
  }

  const players = Object.values(room.players || {});
  const maxI = imposterMax(Math.max(players.length, 2));

  if (room.phase === 'lobby') {
    return (
      <main>
        <Header onHome={onExit} />
        <section className="lobby">
          <button className="leavebtn" onClick={leave}>Leave room</button>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="hg-eyebrow">Room code</div>
            <p className="bigcode">{code}</p>
            <div className="share"><span>{share}</span><button className="mini" onClick={() => { navigator.clipboard.writeText(share); toast('Link copied'); }}>Copy link</button></div>
            {share && <div style={{ marginTop: 16 }}><QR url={share} size={140} /></div>}
          </div>
          <div className="panel">
            <h3>Players ({players.length})</h3>
            {players.map((p) => (
              <div className="player-row" key={p.id}>
                <i>{p.name.charAt(0).toUpperCase()}</i>
                <span>{p.name}</span>
                {p.id === room.hostId && <small>HOST</small>}
                {p.id === uid && <em>you</em>}
              </div>
            ))}
          </div>
          {isHost ? (
            <div className="panel">
              <h3>Categories ({room.settings.cats.length})</h3>
              <ChipRow options={CAT_NAMES} value={room.settings.cats} multi onChange={(cats) => saveImposterSettings(code, uid, { ...room.settings, cats: cats.length ? cats : room.settings.cats })} />
              <h3>Imposters</h3>
              <Stepper value={Math.min(room.settings.imposters, maxI)} min={1} max={maxI} onChange={(v) => saveImposterSettings(code, uid, { ...room.settings, imposters: v })} />
              <h3>Imposter hint</h3>
              <Segmented options={HINT_OPTS} value={room.settings.hint} onChange={(hint) => saveImposterSettings(code, uid, { ...room.settings, hint })} />
            </div>
          ) : (
            <div className="panel">
              <h3>Game settings</h3>
              <p className="hg-note" style={{ margin: 0 }}>Categories: {room.settings.cats.join(', ')}<br />Imposters: {Math.min(room.settings.imposters, maxI)} · Hint: {room.settings.hint}</p>
            </div>
          )}
          {isHost ? (
            <div className="hostbar">
              <span>{players.length < 3 ? `Need ${3 - players.length} more player${3 - players.length > 1 ? 's' : ''}` : 'Ready when you are'}</span>
              <Button disabled={players.length < 3} onClick={hostStartRound}>Start round</Button>
            </div>
          ) : <p className="hg-note" style={{ textAlign: 'center', marginTop: 24 }}>Waiting for the host to start…</p>}
          <ErrorText>{error}</ErrorText>
        </section>
      </main>
    );
  }

  if (room.phase === 'card') {
    const ready = players.filter((p) => p.ready).length;
    return (
      <main>
        <Header onHome={onExit} />
        <section style={{ width: 'min(480px,calc(100% - 32px))', margin: '8vh auto' }}>
          <div className="hg-eyebrow" style={{ textAlign: 'center' }}>Round {room.settings.round?.num ?? 1}</div>
          <h2 style={{ textAlign: 'center', fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{room.players[uid]?.name}, your card</h2>
          <p className="hg-note" style={{ textAlign: 'center' }}>Press and hold. Keep it to yourself.</p>
          <HoldToReveal
            hidden={<button className="hg-btn hg-wide" style={{ marginTop: 20 }}>Hold to reveal</button>}
            revealed={secret ? <RevealCard word={secret.role === 'crew' ? secret.word : undefined} role={secret.role === 'imposter' ? 'You are the IMPOSTER' : undefined} /> : <p className="hg-note">Dealing…</p>}
          />
          {secret?.role === 'imposter' && secret.hint && <p className="hg-note" style={{ textAlign: 'center', marginTop: 10 }}>Hint: {secret.hint}</p>}
          <Button ghost wide style={{ marginTop: 22 }} onClick={() => setReady(code, uid, !room.players[uid]?.ready)}>
            {room.players[uid]?.ready ? "✓ You're ready" : "Got it, I'm ready"}
          </Button>
          <p className="hg-note" style={{ textAlign: 'center', marginTop: 14 }}>{ready} of {players.length} ready</p>
          {isHost && <Button wide style={{ marginTop: 8 }} onClick={() => setRoomPhase(code, uid, 'clues')}>Start clues ({ready}/{players.length})</Button>}
          <button className="leavebtn" style={{ marginTop: 18, display: 'block', marginInline: 'auto' }} onClick={leave}>Leave room</button>
        </section>
      </main>
    );
  }

  if (room.phase === 'clues') {
    const mine = room.players[uid]?.clue || '';
    const withClue = players.filter((p) => p.clue);
    return (
      <main>
        <Header onHome={onExit} />
        <section className="gscreen">
          <button className="leavebtn" onClick={leave}>Leave room</button>
          <div className="panel">
            <h2 style={{ margin: '0 0 6px' }}>Drop your clue</h2>
            <p className="hg-note" style={{ marginTop: 0 }}>One short clue about the secret word. Imposters, fake it.</p>
            <div className="row">
              <TextInput value={clueDraft || mine} onChange={(e) => setClueDraft(e.target.value)} placeholder="Your clue" maxLength={30} onKeyDown={(e) => e.key === 'Enter' && setClue(code, uid, clueDraft)} />
              <button className="mini" onClick={() => setClue(code, uid, clueDraft)}>{mine ? 'Update' : 'Send'}</button>
            </div>
          </div>
          <div className="panel">
            <h3>Clues ({withClue.length}/{players.length})</h3>
            <div className="cluefeed">
              {withClue.length ? withClue.map((p) => <div className="clue-row" key={p.id}><b>{p.name}</b><span>{p.clue}</span></div>) : <p className="hg-note">No clues yet.</p>}
            </div>
          </div>
          {isHost ? (
            <div className="hostbar"><span>{withClue.length} of {players.length} in</span><Button onClick={() => setRoomPhase(code, uid, 'vote')}>Start voting</Button></div>
          ) : <p className="hg-note" style={{ textAlign: 'center' }}>Discuss, then the host opens voting.</p>}
        </section>
      </main>
    );
  }

  if (room.phase === 'vote') {
    const others = players.filter((p) => p.id !== uid);
    const votes = room.votes || {};
    const count = Object.keys(votes).filter((k) => players.some((p) => p.id === k)).length;
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <button className="leavebtn" onClick={leave}>Leave room</button>
          <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Vote the imposter</h2>
          {room.settings.voteNote && <ErrorText>{room.settings.voteNote}</ErrorText>}
          <p className="hg-note">Who's been bluffing? You can't vote for yourself.</p>
          <VoteGrid players={others} selectedId={votes[uid]} onVote={(id) => castVote(code, uid, id)} />
          <p className="hg-note" style={{ marginTop: 16 }}>{count} of {players.length} votes in</p>
        </Card>
      </main>
    );
  }

  if (room.phase === 'guess') {
    const res = room.settings.result;
    const isAccused = res?.accused === uid;
    return (
      <main>
        <Header onHome={onExit} />
        <Card>
          <div style={{ textAlign: 'center' }}>
            <p className="win" style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic', fontSize: 30 }}>{res?.accusedName} was the imposter!</p>
            {isAccused ? (
              <>
                <p className="hg-lead" style={{ margin: '10px auto' }}>One shot: guess the secret word to steal the win.</p>
                <div className="row">
                  <TextInput value={guessDraft} onChange={(e) => setGuessDraft(e.target.value)} placeholder="Guess the word" onKeyDown={(e) => e.key === 'Enter' && sendGuess()} />
                  <button className="mini" onClick={sendGuess}>Guess</button>
                </div>
              </>
            ) : <p className="hg-lead" style={{ margin: '10px auto' }}>{res?.accusedName ?? 'The imposter'} gets one guess at the word to steal the win…</p>}
            {isHost && !isAccused && (
              <Button ghost wide style={{ marginTop: 12 }} onClick={() => saveImposterSettings(code, uid, { ...room.settings, guess: { text: '', by: 'host-pass' } })}>They pass</Button>
            )}
          </div>
        </Card>
      </main>
    );
  }

  function sendGuess() {
    if (!guessDraft.trim()) { toast('Type a guess first'); return; }
    saveImposterSettings(code, uid, { ...room!.settings, guess: { text: guessDraft.trim(), by: uid } }).catch(fail);
  }

  // results
  const res = room.settings.result;
  const imps = res?.imposterNames || [];
  const verdict = res?.outcome === 'crew' ? 'The group wins!' : res?.outcome === 'steal' ? 'The imposter steals it!' : 'The imposter survives!';
  const cls = res?.outcome === 'crew' ? 'win' : 'lose';
  const detail = res?.outcome === 'crew'
    ? `${res?.accusedName ?? ''} was caught${res?.guess ? ` and guessed "${res.guess}", wrong.` : '.'}`
    : res?.outcome === 'steal'
      ? `${res?.accusedName ?? ''} was caught… then guessed the word. Brutal.`
      : `${res?.accusedName ?? ''} was innocent.`;
  return (
    <main>
      <Header onHome={onExit} />
      <Card>
        <div className="resultcard">
          <p className={'verdict ' + cls}>{verdict}</p>
          <p className="hg-lead" style={{ margin: '8px auto' }}>{detail}</p>
          <div className="panel">
            <p className="hg-note" style={{ margin: 0 }}>The word was</p>
            <p style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic', fontSize: 40, margin: '6px 0', color: 'var(--hg-rust)' }}>{res?.word}</p>
            <p className="hg-note">Imposter{imps.length > 1 ? 's' : ''}: <b>{imps.join(', ')}</b></p>
          </div>
          {isHost ? (
            <>
              <Button wide onClick={hostStartRound}>Next round</Button>
              <Button ghost wide style={{ marginTop: 10 }} onClick={() => setRoomPhase(code, uid, 'lobby')}>Back to lobby</Button>
            </>
          ) : <p className="hg-note">Waiting for the host…</p>}
          <button className="leavebtn" style={{ marginTop: 18 }} onClick={leave}>Leave room</button>
        </div>
      </Card>
    </main>
  );
}
