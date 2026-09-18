import { WORD_BANK, CATEGORIES } from './words';

export type Phase = 'lobby' | 'drawing' | 'roundEnd' | 'finished';
export type Player = { id: string; name: string; score: number; connected?: boolean };
// round/artistId/lastWord live here (not as separate room fields) because
// only hostId/phase/createdAt/settings/players/votes/privilegedUid have
// per-field write rules, see firebase.ts's note on the strokes path for
// the same constraint applied to a case that couldn't reuse settings.
export type Settings = {
  roundSeconds: number;
  targetScore: number;
  round: number;
  artistId: string;
  lastWord?: string;
};
export type StrokePoint = [number, number];
export type Stroke = { seq: number; points: StrokePoint[]; color: string; width: number };

export function mk(id: string, name: string): Player {
  return { id, name, score: 0 };
}

/** Picks a word not yet used this game; reshuffles once every word is exhausted. */
export function pickWord(usedWords: string[]): { word: string; category: string } {
  const all: { word: string; category: string }[] = [];
  for (const category of CATEGORIES) for (const word of WORD_BANK[category]) all.push({ word, category });
  const unused = all.filter((w) => !usedWords.includes(w.word));
  const pool = unused.length > 0 ? unused : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Deterministic rotation: next player id after the current artist, wrapping around. */
export function nextArtist(playerIds: string[], currentArtistId: string): string {
  if (playerIds.length === 0) throw new Error('No players');
  const ordered = [...playerIds].sort();
  const idx = ordered.indexOf(currentArtistId);
  return ordered[(idx + 1) % ordered.length];
}

export function checkGuess(guess: string, word: string): boolean {
  return guess.trim().toLowerCase() === word.trim().toLowerCase();
}

/**
 * A single unbroken stroke (scribbling for seconds without lifting) could
 * otherwise produce an unbounded points array in one Firebase write, * decimate down to at most `max` evenly-spaced points, always keeping the
 * first and last so the stroke's endpoints are preserved.
 */
export function decimateStroke(points: StrokePoint[], max = 300): StrokePoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: StrokePoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function winners(players: Record<string, Player>, targetScore: number): Player[] {
  return Object.values(players).filter((p) => p.score >= targetScore);
}
