import { useState, type ReactNode } from 'react';
import { Card, Button, Field, TextInput, ErrorText } from '@ui/index';
import { useAuth } from './AuthContext';

export type Identity = { uid: string; name: string; isHost: boolean };

/**
 * Every game screen needs an identity before it can create/join a room: a
 * real account (host-eligible) or an anonymous guest with a chosen name.
 * This gates on that once, so no individual game has to re-implement the
 * sign-in-anonymously-then-ask-for-a-name flow.
 */
export function RequireIdentity({ children }: { children: (identity: Identity) => ReactNode }) {
  const { user, profile, isHost, guestName, setGuestName, continueAsGuest, loading } = useAuth();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (user && isHost) {
    return <>{children({ uid: user.uid, name: profile?.displayName ?? user.displayName ?? 'Host', isHost: true })}</>;
  }

  if (user && user.isAnonymous && guestName) {
    return <>{children({ uid: user.uid, name: guestName, isHost: false })}</>;
  }

  async function submit() {
    const trimmed = draft.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      setError('Name must be 1-20 characters');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (!user) await continueAsGuest();
      setGuestName(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="hg-eyebrow">One quick thing</div>
      <h2 style={{ fontFamily: 'var(--hg-font-display)', fontStyle: 'italic' }}>What's your name?</h2>
      <Field label="Displayed to other players">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your name"
          maxLength={20}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button wide disabled={busy} onClick={submit} style={{ marginTop: 18 }}>Continue</Button>
    </Card>
  );
}
