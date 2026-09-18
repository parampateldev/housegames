import { describe, it, expect } from 'vitest';
import { scoreGuess, opponentCallCorrect, nextPsychic } from '../../apps/web/src/games/wavelength/game';

describe('scoreGuess', () => {
  it('awards 4 points for an exact or near-exact guess', () => {
    expect(scoreGuess(50, 50)).toBe(4);
    expect(scoreGuess(50, 53)).toBe(4);
  });
  it('awards 3 then 2 then 0 as distance grows', () => {
    expect(scoreGuess(50, 56)).toBe(3);
    expect(scoreGuess(50, 60)).toBe(2);
    expect(scoreGuess(50, 70)).toBe(0);
  });
});

describe('opponentCallCorrect', () => {
  it('right is correct when the target is right of the guess', () => {
    expect(opponentCallCorrect(70, 50, 'right')).toBe(true);
    expect(opponentCallCorrect(70, 50, 'left')).toBe(false);
  });
  it('left is correct when the target is left of the guess', () => {
    expect(opponentCallCorrect(30, 50, 'left')).toBe(true);
  });
});

describe('nextPsychic', () => {
  it('rotates to the next teammate, wrapping around', () => {
    const players = [
      { id: 'a', name: 'A', team: 'A' as const },
      { id: 'b', name: 'B', team: 'A' as const },
      { id: 'c', name: 'C', team: 'B' as const },
    ];
    expect(nextPsychic(players, 'A', 'a')).toBe('b');
    expect(nextPsychic(players, 'A', 'b')).toBe('a');
  });
});
