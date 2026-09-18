import type { ReactNode } from 'react';

export function PlayerList<T extends { id: string; name: string; eliminated?: boolean }>({
  players, hostId, rightSlot,
}: {
  players: T[];
  hostId?: string;
  rightSlot?: (p: T) => ReactNode;
}) {
  return (
    <ul className="hg-players">
      {players.map((p) => (
        <li key={p.id} className={p.eliminated ? 'eliminated' : ''}>
          <span>{p.name}{p.id === hostId ? ' 👑' : ''}</span>
          {rightSlot ? <span>{rightSlot(p)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
