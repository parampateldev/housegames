export type Phase = 'lobby' | 'acting' | 'roundEnd';
export type Player = { id: string; name: string; team?: 'A' | 'B'; score?: number };

export function nextActor(players: Player[], team: 'A' | 'B', currentActorId: string): string {
  const teamMembers = players.filter((p) => p.team === team);
  const idx = teamMembers.findIndex((p) => p.id === currentActorId);
  return teamMembers[(idx + 1) % teamMembers.length]?.id ?? teamMembers[0]?.id ?? '';
}

export function otherTeam(team: 'A' | 'B'): 'A' | 'B' {
  return team === 'A' ? 'B' : 'A';
}
