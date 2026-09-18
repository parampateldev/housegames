import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, BackLink, Button, Field, TextInput, ErrorText } from '@ui/index';
import { isPlausibleEmail, passwordStrength, type PasswordStrength } from '@fb/index';
import { useAuth } from './AuthContext';

const STRENGTH_COPY: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: 'Weak', color: 'var(--hg-error)', width: '33%' },
  medium: { label: 'Medium', color: 'var(--hg-highlight)', width: '66%' },
  strong: { label: 'Strong', color: 'var(--hg-success)', width: '100%' },
};

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const s = passwordStrength(password);
  const { label, color, width } = STRENGTH_COPY[s];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 4, background: 'var(--hg-border)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width, background: color, transition: 'width .15s' }} />
      </div>
      <span style={{ fontSize: 12, color }}>{label}</span>
    </div>
  );
}

export function AccountScreen() {
  const nav = useNavigate();
  const { user, signInGoogle, signInEmail, signUpEmail, signOut } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !user.isAnonymous) {
    return (
      <Card>
        <BackLink onClick={() => nav('/')} />
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>You're signed in</h2>
        <p className="hg-note">{user.displayName ?? user.email}</p>
        {!user.emailVerified && user.email && (
          <p className="hg-note" style={{ color: 'var(--hg-highlight)' }}>
            Check {user.email} for a verification link. Your account works right away either way.
          </p>
        )}
        <Button wide onClick={() => nav('/')} style={{ marginTop: 18 }}>Continue to Jestr</Button>
        <Button ghost wide onClick={() => signOut()} style={{ marginTop: 10 }}>Sign out</Button>
      </Card>
    );
  }

  async function submit() {
    setError('');
    if (!isPlausibleEmail(email)) {
      setError('Enter a real email address');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (mode === 'up' && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (mode === 'up' && !name.trim()) {
      setError('Add your name');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password, name.trim());
      }
      // Signing in/up flips `user` via the auth listener, which re-renders
      // this component into the "You're signed in" branch above, so there's
      // nothing further to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <BackLink onClick={() => nav('/')} />
      <div className="hg-eyebrow">Host account</div>
      <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>Sign in to host</h2>
      <p className="hg-note">Only hosts need an account, everyone else joins as a guest with just a name.</p>

      <Button
        wide
        onClick={async () => {
          setError('');
          try { await signInGoogle(); nav('/'); } catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed'); }
        }}
        style={{ marginTop: 18 }}
      >
        Continue with Google
      </Button>

      <div className="hg-note" style={{ textAlign: 'center', margin: '18px 0' }}>or with email</div>

      {mode === 'up' && (
        <Field label="Name">
          <TextInput value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name" />
        </Field>
      )}
      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder="you@example.com"
          onBlur={() => { if (email && !isPlausibleEmail(email)) setError('That doesn\'t look like a real email address'); }}
        />
      </Field>
      <Field label="Password">
        <TextInput type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="At least 6 characters" minLength={6} />
      </Field>
      {mode === 'up' && <StrengthMeter password={password} />}
      {mode === 'up' && (
        <Field label="Confirm password">
          <TextInput type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} placeholder="Type it again" />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <Button wide disabled={busy} onClick={submit} style={{ marginTop: 18 }}>
        {mode === 'in' ? 'Sign in' : 'Create account'}
      </Button>
      <Button ghost wide onClick={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ marginTop: 10 }}>
        {mode === 'in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </Button>
    </Card>
  );
}
