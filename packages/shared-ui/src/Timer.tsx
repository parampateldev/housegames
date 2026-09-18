import { useEffect, useState } from 'react';

/**
 * Countdown display only, purely cosmetic. `endsAt` (or its absence) never
 * gates access to data; only an explicit phase/field write from the host
 * does that (see docs/ARCHITECTURE.md, Firebase rules are not re-evaluated
 * on a clock tick, so nothing here is ever load-bearing for security).
 */
export function Timer({ endsAt, onDone }: { endsAt: number; onDone?: () => void }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (remainingMs === 0 && onDone) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs === 0]);

  if (!endsAt) return null;
  return <span className="hg-timer">{String(Math.floor(seconds / 60)).padStart(1, '0')}:{String(seconds % 60).padStart(2, '0')}</span>;
}
