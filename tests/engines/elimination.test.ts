import { describe, it, expect } from 'vitest';
import {
  assignRoles, resolveNight, tallyDayVote, checkWinner, shuffle,
} from '../../packages/game-engines/elimination-engine/src/engine';
import { defaultWerewolfRoles, recommendedMafiaRoles, validateRoleComposition } from '../../packages/game-engines/elimination-engine/src/roles';
import type { EnginePlayer, NightSubmission, Team } from '../../packages/game-engines/elimination-engine/src/types';

const seeded = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

describe('shuffle', () => {
  it('preserves all elements, never mutates input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(1));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(input);
  });
});

describe('assignRoles', () => {
  it('throws if role counts do not equal player count', () => {
    expect(() => assignRoles(['a', 'b', 'c'], [{ id: 'villager', team: 'town', behaviors: ['none'], count: 2 }])).toThrow();
  });

  it('assigns every player exactly one role from the pool', () => {
    const players = ['a', 'b', 'c', 'd'];
    const roles = assignRoles(players, [
      { id: 'evil', team: 'evil', behaviors: ['kill'], count: 1 },
      { id: 'villager', team: 'town', behaviors: ['none'], count: 3 },
    ], seeded(42));
    expect(Object.keys(roles).sort()).toEqual(players.sort());
    expect(Object.values(roles).filter((r) => r === 'evil')).toHaveLength(1);
  });
});

describe('resolveNight, the order-of-operations bug class', () => {
  const teamByUid: Record<string, Team> = { mafia1: 'evil', doc: 'town', vic: 'town', det: 'town' };
  const sub = (uid: string, behavior: NightSubmission['behavior'], targetUid: string, team: Team = 'town'): NightSubmission => ({ uid, team, behavior, targetUid });

  it('a protect save on the exact target the pack chose cancels the kill', () => {
    const result = resolveNight([sub('mafia1', 'kill', 'vic', 'evil'), sub('doc', 'protect', 'vic')], teamByUid);
    expect(result.killedUids).toEqual([]);
  });

  it('a protect save on a DIFFERENT player does not protect the actual target', () => {
    const result = resolveNight([sub('mafia1', 'kill', 'vic', 'evil'), sub('doc', 'protect', 'doc')], teamByUid);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('no save at all: the pack kill goes through', () => {
    const result = resolveNight([sub('mafia1', 'kill', 'vic', 'evil')], teamByUid);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('poison kills even if the pack target was saved (independent, unblockable action)', () => {
    const result = resolveNight([
      sub('mafia1', 'kill', 'vic', 'evil'), sub('doc', 'protect', 'vic'), sub('doc', 'poison', 'det'),
    ], teamByUid);
    expect(result.killedUids.sort()).toEqual(['det']);
  });

  it('detective investigation correctly identifies the evil team, never a false negative', () => {
    const evilCheck = resolveNight([sub('det', 'investigate', 'mafia1')], teamByUid);
    expect(evilCheck.investigations).toEqual([{ investigatorUid: 'det', targetUid: 'mafia1', isEvil: true }]);
    const townCheck = resolveNight([sub('det', 'investigate', 'vic')], teamByUid);
    expect(townCheck.investigations).toEqual([{ investigatorUid: 'det', targetUid: 'vic', isEvil: false }]);
  });

  it('deduplicates if pack-kill and poison somehow target the same uid', () => {
    const result = resolveNight([sub('mafia1', 'kill', 'vic', 'evil'), sub('doc', 'poison', 'vic')], teamByUid);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('a protect save blocks a solo-kill on the same target, same as the pack\'s kill', () => {
    const result = resolveNight([sub('doc', 'solo-kill', 'vic'), sub('doc', 'protect', 'vic')], teamByUid);
    expect(result.killedUids).toEqual([]);
  });

  it('a solo-kill lands independently of the pack\'s own kill', () => {
    const result = resolveNight([sub('mafia1', 'kill', 'det', 'evil'), sub('doc', 'solo-kill', 'vic')], teamByUid);
    expect(result.killedUids.sort()).toEqual(['det', 'vic']);
  });

  it('kill votes only pool within the same team, never across teams', () => {
    const result = resolveNight([
      sub('mafia1', 'kill', 'vic', 'evil'),
      sub('doc', 'kill', 'det', 'town'), // a hypothetical town-team "kill together" role
    ], teamByUid);
    expect(result.killedUids.sort()).toEqual(['det', 'vic']);
  });
});

describe('tallyDayVote', () => {
  it('elects the clear majority target', () => {
    expect(tallyDayVote({ a: 'x', b: 'x', c: 'y' }).eliminatedUid).toBe('x');
  });

  it('a tie produces no elimination', () => {
    const result = tallyDayVote({ a: 'x', b: 'y' });
    expect(result.eliminatedUid).toBeNull();
    expect(result.tie).toBe(true);
  });

  it('no votes at all resolves to no elimination, not a tie', () => {
    const result = tallyDayVote({});
    expect(result.eliminatedUid).toBeNull();
    expect(result.tie).toBe(false);
  });

  it('a weighted voter (e.g. Mayor) can single-handedly outweigh one unweighted vote', () => {
    const result = tallyDayVote({ mayor: 'x', a: 'y' }, { mayor: 2 });
    expect(result.eliminatedUid).toBe('x');
  });
});

describe('checkWinner', () => {
  const p = (id: string, team: Team, alive = true): EnginePlayer => ({ id, role: team === 'evil' ? 'evil' : 'villager', team, alive });

  it('town wins once no evil players remain alive', () => {
    expect(checkWinner([p('a', 'evil', false), p('b', 'town')])).toBe('town');
  });

  it('evil wins once they equal or outnumber town', () => {
    expect(checkWinner([p('a', 'evil'), p('b', 'evil'), p('c', 'town')])).toBe('evil');
  });

  it('game continues while town still outnumbers evil', () => {
    expect(checkWinner([p('a', 'evil'), p('b', 'town'), p('c', 'town')])).toBeNull();
  });

  it('eliminated players never count toward either side', () => {
    expect(checkWinner([p('a', 'evil', false), p('b', 'town')])).toBe('town');
  });
});

describe('role rosters', () => {
  it('werewolf role counts always sum to the player count, and witch only appears at 7+', () => {
    for (let n = 4; n <= 16; n++) {
      const defs = defaultWerewolfRoles(n);
      expect(defs.reduce((s, r) => s + r.count, 0)).toBe(n);
      const hasWitch = defs.some((d) => d.id === 'witch');
      expect(hasWitch).toBe(n >= 7);
    }
  });

  it('werewolf rejects too-small player counts rather than producing a broken game', () => {
    expect(() => defaultWerewolfRoles(3)).toThrow();
  });

  it('recommended mafia rosters always validate for their own player count', () => {
    for (let n = 4; n <= 20; n++) {
      expect(validateRoleComposition(n, recommendedMafiaRoles(n))).toBeNull();
    }
  });
});

describe('validateRoleComposition, the host-customizable roster gate', () => {
  it('villagers/townies fill whatever the chosen named roles leave behind', () => {
    const roles = [
      { id: 'Mafia', team: 'evil' as Team, behaviors: ['kill' as const], count: 2 },
      { id: 'Police', team: 'town' as Team, behaviors: ['investigate' as const], count: 1 },
      { id: 'Townie', team: 'town' as Team, behaviors: ['none' as const], count: 7 },
    ];
    expect(validateRoleComposition(10, roles)).toBeNull();
  });

  it('rejects a mafia count that would equal or outnumber the town', () => {
    const roles = [
      { id: 'Mafia', team: 'evil' as Team, behaviors: ['kill' as const], count: 3 },
      { id: 'Townie', team: 'town' as Team, behaviors: ['none' as const], count: 3 },
    ];
    expect(validateRoleComposition(6, roles)).not.toBeNull();
  });

  it('rejects a roster that does not add up to the exact player count', () => {
    const roles = [
      { id: 'Mafia', team: 'evil' as Team, behaviors: ['kill' as const], count: 1 },
      { id: 'Townie', team: 'town' as Team, behaviors: ['none' as const], count: 1 },
    ];
    expect(validateRoleComposition(4, roles)).not.toBeNull();
  });

  it('rejects duplicate role names', () => {
    const roles = [
      { id: 'Mafia', team: 'evil' as Team, behaviors: ['kill' as const], count: 1 },
      { id: 'Mafia', team: 'town' as Team, behaviors: ['none' as const], count: 3 },
    ];
    expect(validateRoleComposition(4, roles)).not.toBeNull();
  });

  it('rejects a roster with no mafia-team role at all', () => {
    const roles = [{ id: 'Townie', team: 'town' as Team, behaviors: ['none' as const], count: 4 }];
    expect(validateRoleComposition(4, roles)).not.toBeNull();
  });
});
