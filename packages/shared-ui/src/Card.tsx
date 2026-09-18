import type { ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['hg-card', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function BackLink({ onClick, children = '← Back' }: { onClick: () => void; children?: ReactNode }) {
  return <button className="hg-back" onClick={onClick}>{children}</button>;
}
