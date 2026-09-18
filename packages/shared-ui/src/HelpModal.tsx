import { useState, type ReactNode } from 'react';

/**
 * The "Help" button + modal every game uses to explain its own rules in
 * plain language, no filler. Pass the actual rules as children (an
 * ordered list of real steps works best), written per game, not generated
 * boilerplate.
 */
export function HelpModal({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="help-button" onClick={() => setOpen(true)}>Help</button>
      {open && (
        <div className="help-backdrop" role="dialog" aria-modal="true" aria-label={`How to play ${title}`}>
          <section className="help-panel">
            <button type="button" className="help-close" onClick={() => setOpen(false)} aria-label="Close help">&times;</button>
            <div className="hg-eyebrow">How to play</div>
            <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>{title}</h2>
            {children}
            <button type="button" className="hg-btn" onClick={() => setOpen(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  );
}
