import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GAMES, findGame } from './games/registry';
import { useAuth } from './auth/AuthContext';
import { Button } from '@ui/index';
import { watchProfile, type RecentRoom } from '@fb/index';

export function Home() {
  const { user, isHost, loading, signOut } = useAuth();
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);

  useEffect(() => {
    if (!user || !isHost) { setRecentRooms([]); return; }
    return watchProfile(user.uid, (profile) => {
      const rooms = Object.values(profile?.recentRooms ?? {}).sort((a, b) => b.at - a.at);
      setRecentRooms(rooms);
    });
  }, [user, isHost]);

  return (
    <main>
      <header style={{ padding: '22px clamp(18px,5vw,72px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="hg-eyebrow" style={{ fontWeight: 700, color: 'var(--hg-ink)' }}>Huddl</span>
        {!loading && (
          user ? (
            <div className="hg-row">
              <span className="hg-note">{isHost ? user.displayName ?? 'Host' : 'Guest'}</span>
              <Button ghost small onClick={() => signOut()}>Sign out</Button>
            </div>
          ) : (
            <Link to="/account"><Button ghost small>Sign in to host</Button></Link>
          )
        )}
      </header>

      <div className="hero" style={{ padding: '4vh clamp(22px,8vw,130px) 2vh' }}>
        <div className="hg-eyebrow">Twelve games, one room code</div>
        <h1 className="hg-headline">Hu<em>ddl</em></h1>
        <p className="hg-lead">
          Sign in to host a room, or jump straight in as a guest with just a name. Pick a game below.
        </p>
      </div>

      {isHost && recentRooms.length > 0 && (
        <div style={{ padding: '0 clamp(22px,8vw,130px) 2vh' }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--hg-muted)', marginBottom: 10 }}>
            Your recent rooms
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {recentRooms.map((r) => {
              const game = findGame(r.gameSlug);
              if (!game) return null;
              return (
                <Link
                  key={`${r.gameSlug}_${r.code}`}
                  to={`/${r.gameSlug}/${r.code}`}
                  style={{
                    textDecoration: 'none', color: 'inherit', background: 'var(--hg-card)',
                    border: '1px solid var(--hg-border)', padding: '10px 16px', borderRadius: 999,
                    fontSize: 13,
                  }}
                >
                  {game.label} · {r.code}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 18,
        padding: '2vh clamp(22px,8vw,130px) 8vh',
      }}
      >
        {GAMES.map((g) => (
          <Link
            key={g.slug}
            to={`/${g.slug}`}
            style={{
              textDecoration: 'none', color: 'inherit', background: 'var(--hg-card)',
              border: '1px solid var(--hg-border)', padding: '22px', boxShadow: '8px 8px 0 var(--hg-shadow-color)',
            }}
          >
            <div style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic', fontWeight: 600, fontSize: 24 }}>{g.label}</div>
            <p className="hg-note" style={{ margin: '8px 0 0' }}>{g.tagline}</p>
            <p className="hg-note" style={{ margin: '10px 0 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>{g.minPlayers}+ players</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
