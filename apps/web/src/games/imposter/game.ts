// Ported from the original imposter repo's inline app.js — same word-pool,
// guess-matching and hint logic, unchanged.
import wordsData from '../../../../../content/imposter-words.json';

export type CatData = { b: string; w: string[] };
export const CATS: Record<string, CatData> = wordsData as Record<string, CatData>;
export const CAT_NAMES = Object.keys(CATS);
export const WORD_COUNT = Object.values(CATS).reduce((s, c) => s + c.w.length, 0);

export type Phase = 'lobby' | 'card' | 'clues' | 'vote' | 'guess' | 'results';
export type Role = 'imposter' | 'crew';
export type Secret = { role: Role; word?: string; hint?: string };
export type Player = { id: string; name: string; joinedAt: number; clue?: string; ready?: boolean };
export type RoundInfo = { num: number; cat: string };
export type ResultInfo = {
  accused: string; accusedName: string; wasImposter?: boolean; outcome?: 'crew' | 'steal' | 'imposter';
  word?: string; imposterNames?: string[]; guess?: string; guessCorrect?: boolean;
};
export type HintLevel = 'off' | 'okay' | 'good' | 'great';
export type ImposterSettings = {
  cats: string[];
  imposters: number;
  hint: HintLevel;
  round?: RoundInfo;
  result?: ResultInfo | null;
  voteNote?: string | null;
  guess?: { text: string; by: string } | null;
  usedWords?: Record<string, string[]>;
};

export function defaultCats(): string[] {
  return ['Animals', 'Food', 'Movies', 'Celebrities', 'Office Supplies', 'Kitchen Stuff', 'Video Games', 'Jobs', 'Places', 'Body Parts'].filter((c) => CATS[c]);
}

export function imposterMax(n: number): number {
  return Math.max(1, n - 1);
}

export function normWord(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

/** Exact match, or a match once trailing plural 's' is stripped from every word. */
export function guessMatches(guess: string, word: string): boolean {
  const g = normWord(guess);
  const w = normWord(word);
  if (!g) return false;
  if (g === w) return true;
  const strip = (s: string) => s.split(' ').map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)).join(' ');
  return strip(g) === strip(w);
}

export function makeHint(level: HintLevel, cat: string, word: string): string {
  if (level === 'okay') return 'Broad hint: ' + CATS[cat].b;
  if (level === 'good') return 'Category: ' + cat;
  const letters = normWord(word).replace(/ /g, '').length;
  const first = normWord(word).charAt(0).toUpperCase();
  return `Category: ${cat} · starts with ${first} · ${letters} letters`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks a word the room hasn't seen from this category set; reshuffles a
 * category only once it runs dry. Returns the updated `used` map rather
 * than mutating the input — callers persist it back to Firebase themselves.
 */
export function pickWord(cats: string[], used: Record<string, string[]>): { cat: string; word: string; usedWords: Record<string, string[]> } {
  const avail = cats.filter((c) => CATS[c] && CATS[c].w.length - (used[c] || []).length > 0);
  const pool = avail.length ? avail : cats;
  const cat = pick(pool);
  const seen = used[cat] || [];
  const fresh = CATS[cat].w.filter((w) => seen.indexOf(w) < 0);
  const word = fresh.length ? pick(fresh) : pick(CATS[cat].w);
  const nextUsed = { ...used, [cat]: [...(used[cat] || [])] };
  if (nextUsed[cat].indexOf(word) < 0) nextUsed[cat].push(word);
  return { cat, word, usedWords: nextUsed };
}
