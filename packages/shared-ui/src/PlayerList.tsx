import type { ReactNode } from 'react';

export function PlayerList<T extends { id: string; name: string; eliminated?: boolean; alive?: boolean }>({
  players, hostId, rightSlot,
}: {
  players: T[];
  hostId?: string;
  rightSlot?: (p: T) => ReactNode;
}) {
  return (
    <ul className="hg-players">
      {players.map((p) => {
        // Empire's Player marks death with `eliminated`, Mafia/Werewolf/Secret
        // Hitler's with `alive: false`; support both so every game's roster
        // actually shows who's out, not just games using the first shape.
        const isOut = p.eliminated ?? p.alive === false;
        return (
          <li key={p.id} className={isOut ? 'eliminated' : ''}>
            <span>{p.name}{p.id === hostId ? ' (host)' : ''}</span>
            {rightSlot ? <span>{rightSlot(p)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
