import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type { User };

/** A host must be a real, non-anonymous account, that's what makes "save" persistent. */
export function isHostEligible(user: User | null): boolean {
  return Boolean(user && !user.isAnonymous);
}

/** A basic, deliberately strict shape check so obviously-fake input ("asdf") never reaches Firebase. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isPlausibleEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export type PasswordStrength = 'weak' | 'medium' | 'strong';

/** Length + character-class variety, no external list, good enough for a casual party-game signup. */
export function passwordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured');
  if (!isPlausibleEmail(email)) throw new Error('Enter a real email address');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await sendEmailVerification(cred.user).catch(() => {});
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
