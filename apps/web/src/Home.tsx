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
      <header className="hg-appbar">
        <div className="hg-appbar-left">
          <span className="hg-logo">
            <b className="c1">J</b><b className="c2">e</b><b className="c3">s</b><b className="c4">t</b><b className="c5">r</b>
          </span>
          <span className="hg-appbar-badge">Party Game Suite</span>
        </div>
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

      <div className="hg-shell">
        <div className="hg-banner">
          <div>
            <h1>Twelve games, one room code</h1>
            <p>Sign in to host a room, or jump straight in as a guest with just a name. Pick a game below.</p>
          </div>
          <div className="hg-banner-stats">
            <div className="hg-stat-pill"><span className="num">12</span><span className="label">Games</span></div>
            <div className="hg-stat-pill"><span className="num">2-20</span><span className="label">Players</span></div>
            <div className="hg-stat-pill"><span className="num">Free</span><span className="label">No app</span></div>
          </div>
        </div>

        {isHost && recentRooms.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--hg-muted)', marginBottom: 10 }}>
              Your recent rooms
            </h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {recentRooms.map((r) => {
                const game = findGame(r.gameSlug);
                if (!game) return null;
                return (
                  <Link key={`${r.gameSlug}_${r.code}`} to={`/${r.gameSlug}/${r.code}`} className="hg-tag-chip" style={{ textDecoration: 'none', padding: '10px 16px', fontSize: 13 }}>
                    {game.label} · {r.code}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="hg-game-grid">
          {GAMES.map((g) => (
            <Link key={g.slug} to={`/${g.slug}`} className="hg-game-card">
              <div className="hg-game-card-head">
                <span className={`material-symbols-outlined hg-card-icon ${g.accent}`}>{g.icon}</span>
                <h3>{g.label}</h3>
              </div>
              <p className="hg-game-card-desc">{g.tagline}</p>
              <div className="hg-game-card-footer">
                <span className="hg-tag-chip">{g.minPlayers}+ players</span>
                <span className="hg-action-link">Play →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
