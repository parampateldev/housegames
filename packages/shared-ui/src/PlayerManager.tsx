import { useState } from 'react';
import { Button } from './Button';
import { TextInput } from './Form';

export type ManagedPlayer = { id: string; name: string };

/**
 * Host-only room controls: hand off host to someone else, remove a player,
 * or add a player who has no device of their own (a local, host-driven
 * seat, common for a family member without a phone in the room).
 */
export function PlayerManager({
  players, hostId, isHost, onMakeHost, onRemove, onAddLocal,
}: {
  players: ManagedPlayer[];
  hostId: string;
  isHost: boolean;
  onMakeHost: (uid: string) => void;
  onRemove: (uid: string) => void;
  onAddLocal: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localName, setLocalName] = useState('');

  if (!isHost) return null;

  return (
    <div className="hg-player-manager">
      <button type="button" className="hg-mini-btn" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide room settings' : 'Room settings'}
      </button>
      {open && (
        <div className="hg-player-manager-panel">
          <ul className="hg-manage-list">
            {players.map((p) => (
              <li key={p.id}>
                <span>{p.name}{p.id === hostId ? ' (host)' : ''}</span>
                {p.id !== hostId && (
                  <span className="hg-manage-actions">
                    <button type="button" className="hg-mini-btn" onClick={() => onMakeHost(p.id)}>Make host</button>
                    <button type="button" className="hg-mini-btn hg-mini-danger" onClick={() => onRemove(p.id)}>Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="hg-add-local">
            <TextInput
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="Name of someone without a phone"
              maxLength={20}
            />
            <Button
              small
              onClick={() => { if (localName.trim()) { onAddLocal(localName.trim()); setLocalName(''); } }}
            >
              Add player
            </Button>
          </div>
          <p className="hg-note">
            A player added this way has no device. You will play their turns for them on this screen.
          </p>
        </div>
      )}
    </div>
  );
}
