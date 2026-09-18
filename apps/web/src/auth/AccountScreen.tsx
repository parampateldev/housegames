import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, BackLink, Button, Field, TextInput, ErrorText } from '@ui/index';
import { useAuth } from './AuthContext';

export function AccountScreen() {
  const nav = useNavigate();
  const { user, signInGoogle, signInEmail, signUpEmail, signOut } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && !user.isAnonymous) {
    return (
      <Card>
        <BackLink onClick={() => nav('/')} />
        <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>You're signed in</h2>
        <p className="hg-note">{user.displayName ?? user.email}</p>
        <Button ghost onClick={() => signOut().then(() => nav('/'))}>Sign out</Button>
      </Card>
    );
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'in') await signInEmail(email, password);
      else await signUpEmail(email, password, name);
      nav('/');
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
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Field>
      )}
      <Field label="Email">
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
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
