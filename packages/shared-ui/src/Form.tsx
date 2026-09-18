import type { InputHTMLAttributes, ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="hg-field-label">
      {label}
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="hg-input" {...props} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="hg-error-text">{children}</div>;
}
