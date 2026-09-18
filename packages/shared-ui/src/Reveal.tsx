import { useState, type ReactNode } from 'react';

export function RevealCard({ word, role }: { word?: string; role?: string }) {
  return (
    <div className="hg-reveal-card">
      {word && <div className="word">{word}</div>}
      {role && <div className="role">{role}</div>}
    </div>
  );
}

/** Hold-to-peek: a phone passed hand-to-hand reveals its secret only while pressed. */
export function HoldToReveal({ hidden, revealed }: { hidden: ReactNode; revealed: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      onPointerDown={() => setShow(true)}
      onPointerUp={() => setShow(false)}
      onPointerCancel={() => setShow(false)}
      onPointerLeave={() => setShow(false)}
      style={{ userSelect: 'none', touchAction: 'none' }}
    >
      {show ? revealed : hidden}
    </div>
  );
}
