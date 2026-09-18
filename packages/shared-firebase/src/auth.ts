import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type { User };

/** A host must be a real, non-anonymous account, that's what makes "save" persistent. */
export function isHostEligible(user: User | null): boolean {
  return Boolean(user && !user.isAnonymous);
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/** Guests never get a persistent profile, just an anonymous uid for the room they're in. */
export async function signInAsGuest(): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}
