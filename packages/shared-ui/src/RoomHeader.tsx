import { Link } from 'react-router-dom';
import { QR } from './QR';
import { useToast } from './Toast';

/** Wordmark link back to the dashboard, room code, QR, and a copy-link bar. Used at the top of every game's lobby. */
export function RoomHeader({ gameLabel, code, shareUrl }: { gameLabel: string; code: string; shareUrl: string }) {
  const toast = useToast();
  return (
    <div className="hg-room-header">
      <div className="hg-room-header-top">
        <Link to="/" className="hg-dashboard-link">All games</Link>
        <div className="hg-eyebrow">Room {code}</div>
      </div>
      <div className="hg-room-header-main">
        <h2 className="hg-room-title">{gameLabel}</h2>
        <QR url={shareUrl} size={120} />
      </div>
      <div className="hg-share-bar">
        <span>{shareUrl}</span>
        <button
          className="hg-mini-btn"
          onClick={() => { navigator.clipboard.writeText(shareUrl); toast('Link copied'); }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}
