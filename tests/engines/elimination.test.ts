import { describe, it, expect } from 'vitest';
import {
  assignRoles, resolveNight, tallyDayVote, checkWinner, shuffle,
} from '../../packages/game-engines/elimination-engine/src/engine';
import { defaultMafiaRoles, defaultWerewolfRoles, buildMafiaRoles, recommendedMafiaOptions } from '../../packages/game-engines/elimination-engine/src/roles';
import type { EnginePlayer, RoleId } from '../../packages/game-engines/elimination-engine/src/types';

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
    expect(() => assignRoles(['a', 'b', 'c'], [{ id: 'villager', team: 'town', count: 2 }])).toThrow();
  });

  it('assigns every player exactly one role from the pool', () => {
    const players = ['a', 'b', 'c', 'd'];
    const roles = assignRoles(players, [
      { id: 'evil', team: 'evil', count: 1 },
      { id: 'villager', team: 'town', count: 3 },
    ], seeded(42));
    expect(Object.keys(roles).sort()).toEqual(players.sort());
    expect(Object.values(roles).filter((r) => r === 'evil')).toHaveLength(1);
  });
});

describe('resolveNight, the order-of-operations bug class', () => {
  const roles: Record<string, RoleId> = { mafia1: 'evil', doc: 'doctor', vic: 'villager', det: 'detective' };

  it('a doctor save on the exact target the pack chose cancels the kill', () => {
    const result = resolveNight({ evilTargetUid: 'vic', doctorSaveUid: 'vic' }, roles);
    expect(result.killedUids).toEqual([]);
  });

  it('a doctor save on a DIFFERENT player does not protect the actual target', () => {
    const result = resolveNight({ evilTargetUid: 'vic', doctorSaveUid: 'doc' }, roles);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('no save at all: the pack kill goes through', () => {
    const result = resolveNight({ evilTargetUid: 'vic' }, roles);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('witch poison kills even if the pack target was saved (independent action)', () => {
    const result = resolveNight({ evilTargetUid: 'vic', doctorSaveUid: 'vic', witchPoisonUid: 'det' }, roles);
    expect(result.killedUids.sort()).toEqual(['det']);
  });

  it('detective investigation correctly identifies the evil team, never a false negative', () => {
    const evilCheck = resolveNight({ detectiveCheckUid: 'mafia1' }, roles);
    expect(evilCheck.investigation).toEqual({ targetUid: 'mafia1', isEvil: true });
    const townCheck = resolveNight({ detectiveCheckUid: 'vic' }, roles);
    expect(townCheck.investigation).toEqual({ targetUid: 'vic', isEvil: false });
  });

  it('deduplicates if pack-kill and poison somehow target the same uid', () => {
    const result = resolveNight({ evilTargetUid: 'vic', witchPoisonUid: 'vic' }, roles);
    expect(result.killedUids).toEqual(['vic']);
  });

  it('a doctor save blocks the vigilante\'s shot on the same target, same as the pack\'s kill', () => {
    const result = resolveNight({ vigilanteTargetUid: 'vic', doctorSaveUid: 'vic' }, roles);
    expect(result.killedUids).toEqual([]);
  });

  it('the vigilante\'s shot lands independently of the pack\'s own kill', () => {
    const result = resolveNight({ evilTargetUid: 'det', vigilanteTargetUid: 'vic' }, roles);
    expect(result.killedUids.sort()).toEqual(['det', 'vic']);
  });
});

describe('buildMafiaRoles, the host-customizable composition', () => {
  it('villagers fill whatever the chosen named roles leave behind', () => {
    const defs = buildMafiaRoles(10, { evilCount: 2, hasDetective: true, hasDoctor: true, hasVigilante: true });
    expect(defs.reduce((s, r) => s + r.count, 0)).toBe(10);
    expect(defs.find((r) => r.id === 'villager')?.count).toBe(5);
  });

  it('rejects a mafia count that would equal or outnumber the town', () => {
    expect(() => buildMafiaRoles(6, { evilCount: 3, hasDetective: false, hasDoctor: false, hasVigilante: false })).toThrow();
  });

  it('rejects more named roles than there are players', () => {
    expect(() => buildMafiaRoles(4, { evilCount: 1, hasDetective: true, hasDoctor: true, hasVigilante: true })).toThrow();
  });

  it('recommended options always produce a valid, playable composition', () => {
    for (let n = 4; n <= 20; n++) {
      expect(() => buildMafiaRoles(n, recommendedMafiaOptions(n))).not.toThrow();
    }
  });

  it('recommends the vigilante only once the room is large enough', () => {
    expect(recommendedMafiaOptions(7).hasVigilante).toBe(false);
    expect(recommendedMafiaOptions(8).hasVigilante).toBe(true);
  });
});

describe('tallyDayVote', () => {
  it('elects the clear majority target', () => {
    expect(tallyDayVote({ a: 'x', b: 'x', c: 'y' })).toEqual({ eliminatedUid: 'x', tie: false });
  });

  it('reports a tie instead of silently picking a winner', () => {
    expect(tallyDayVote({ a: 'x', b: 'y' })).toEqual({ eliminatedUid: null, tie: true });
  });

  it('no votes cast yet: neither eliminates nor false-reports a tie', () => {
    expect(tallyDayVote({})).toEqual({ eliminatedUid: null, tie: false });
  });
});

describe('checkWinner', () => {
  function p(id: string, role: RoleId, alive = true): EnginePlayer { return { id, role, alive }; }

  it('town wins once every evil player is eliminated', () => {
    expect(checkWinner([p('a', 'villager'), p('b', 'evil', false)])).toBe('town');
  });

  it('evil wins once they equal or outnumber town', () => {
    expect(checkWinner([p('a', 'evil'), p('b', 'evil'), p('c', 'villager')])).toBe('evil');
  });

  it('game continues while town still outnumbers evil', () => {
    expect(checkWinner([p('a', 'evil'), p('b', 'villager'), p('c', 'villager')])).toBeNull();
  });

  it('eliminated players never count toward either side', () => {
    expect(checkWinner([p('a', 'evil', false), p('b', 'villager')])).toBe('town');
  });
});

describe('default role distributions', () => {
  it('mafia role counts always sum to the player count', () => {
    for (let n = 4; n <= 16; n++) {
      const total = defaultMafiaRoles(n).reduce((s, r) => s + r.count, 0);
      expect(total).toBe(n);
    }
  });

  it('werewolf role counts always sum to the player count, and witch only appears at 7+', () => {
    for (let n = 4; n <= 16; n++) {
      const defs = defaultWerewolfRoles(n);
      expect(defs.reduce((s, r) => s + r.count, 0)).toBe(n);
      const hasWitch = defs.some((d) => d.id === 'witch');
      expect(hasWitch).toBe(n >= 7);
    }
  });

  it('rejects too-small player counts rather than producing a broken game', () => {
    expect(() => defaultMafiaRoles(3)).toThrow();
    expect(() => defaultWerewolfRoles(3)).toThrow();
  });
});
