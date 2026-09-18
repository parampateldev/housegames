export type Phase = 'lobby' | 'psychicSees' | 'clueGiven' | 'teamGuess' | 'opponentCall' | 'reveal';
export type Settings = Record<string, never>;
export type Player = { id: string; name: string; team?: 'A' | 'B' };

/** 4/3/2/0-point proximity zones, same shape as the physical game's dial. */
export function scoreGuess(target: number, guess: number): number {
  const dist = Math.abs(target - guess);
  if (dist <= 3) return 4;
  if (dist <= 6) return 3;
  if (dist <= 10) return 2;
  return 0;
}

export function opponentCallCorrect(target: number, guess: number, call: 'left' | 'right'): boolean {
  if (target === guess) return true; // dead center, either call is generous, but this keeps it simple & fair
  const actual = target < guess ? 'left' : 'right';
  return call === actual;
}

export function nextPsychic(players: Player[], team: 'A' | 'B', currentPsychicId: string): string {
  const teamMembers = players.filter((p) => p.team === team);
  const idx = teamMembers.findIndex((p) => p.id === currentPsychicId);
  return teamMembers[(idx + 1) % teamMembers.length]?.id ?? teamMembers[0]?.id ?? '';
}
