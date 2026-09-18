import { describe, it, expect } from 'vitest';
import { nextActor, otherTeam } from '../../apps/web/src/games/charades/game';
import { pickWord, CATEGORIES } from '../../apps/web/src/games/charades/words';

describe('nextActor', () => {
  it('rotates within a team, wrapping around', () => {
    const players = [
      { id: 'a', name: 'A', team: 'A' as const },
      { id: 'b', name: 'B', team: 'A' as const },
      { id: 'c', name: 'C', team: 'B' as const },
    ];
    expect(nextActor(players, 'A', 'a')).toBe('b');
    expect(nextActor(players, 'A', 'b')).toBe('a');
  });
});

describe('otherTeam', () => {
  it('flips A/B', () => {
    expect(otherTeam('A')).toBe('B');
    expect(otherTeam('B')).toBe('A');
  });
});

describe('pickWord', () => {
  it('avoids repeating a used word while alternatives remain', () => {
    const cat = 'Animals';
    const all = CATEGORIES[cat];
    const used = all.slice(0, all.length - 1);
    const picked = pickWord(cat, used);
    expect(picked).toBe(all[all.length - 1]);
  });

  it('falls back to the full pool once everything has been used', () => {
    const cat = 'Animals';
    const picked = pickWord(cat, CATEGORIES[cat]);
    expect(CATEGORIES[cat]).toContain(picked);
  });
});
