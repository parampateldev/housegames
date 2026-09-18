import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import {
  watchAuth, isHostEligible, ensureProfile, watchProfile,
  signInWithGoogle, signUpWithEmail, signInWithEmail, signInAsGuest, signOutUser,
  type User, type UserProfile,
} from '@fb/index';

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isHost: boolean;
  guestName: string;
  setGuestName: (name: string) => void;
  signInGoogle: () => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const GUEST_NAME_KEY = 'hg_guest_name';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestName, setGuestNameState] = useState(() => localStorage.getItem(GUEST_NAME_KEY) ?? '');

  useEffect(() => watchAuth((u) => { setUser(u); setLoading(false); }), []);

  useEffect(() => {
    if (!user || user.isAnonymous) { setProfile(null); return; }
    ensureProfile(user.uid, user.displayName ?? 'Host');
    return watchProfile(user.uid, setProfile);
  }, [user]);

  function setGuestName(name: string) {
    localStorage.setItem(GUEST_NAME_KEY, name);
    setGuestNameState(name);
  }

  const value: AuthState = {
    user,
    profile,
    loading,
    isHost: isHostEligible(user),
    guestName,
    setGuestName,
    async signInGoogle() { await signInWithGoogle(); },
    async signUpEmail(email, password, displayName) { await signUpWithEmail(email, password, displayName); },
    async signInEmail(email, password) { await signInWithEmail(email, password); },
    async continueAsGuest() { await signInAsGuest(); },
    async signOut() { await signOutUser(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
