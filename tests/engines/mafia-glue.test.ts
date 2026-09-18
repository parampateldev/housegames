import { describe, it, expect } from 'vitest';
import { buildNightActions, allNightActionsIn, type MafiaSecret } from '../../apps/web/src/games/mafia/game';
import type { RoleId } from '../../packages/game-engines/elimination-engine/src/types';

const roles: Record<string, RoleId> = {
  m1: 'evil', m2: 'evil', doc: 'doctor', det: 'detective', vic: 'villager',
};

describe('buildNightActions', () => {
  it('resolves the mafia kill target by plurality among evil votes', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    const actions = buildNightActions(secrets, roles, 1);
    expect(actions.evilTargetUid).toBe('vic');
    expect(actions.doctorSaveUid).toBe('vic');
    expect(actions.detectiveCheckUid).toBe('m1');
  });

  it('ignores submissions from a previous round', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
    };
    const actions = buildNightActions(secrets, roles, 2);
    expect(actions.evilTargetUid).toBeUndefined();
  });

  it('a tied mafia vote resolves to no consensus target (tallyDayVote tie semantics)', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'evil', nightAction: { round: 1, targetUid: 'doc' } },
    };
    const actions = buildNightActions(secrets, roles, 1);
    expect(actions.evilTargetUid).toBeUndefined();
  });

  it('witch poison is read from the separate nightPoison field, independent of nightAction', () => {
    const witchRoles: Record<string, RoleId> = { w: 'witch', vic: 'villager' };
    const secrets: Record<string, MafiaSecret> = {
      w: {
        role: 'witch',
        nightAction: { round: 1, targetUid: 'vic' }, // her save
        nightPoison: { round: 1, targetUid: 'vic' }, // her poison, same or different target
      },
    };
    const actions = buildNightActions(secrets, witchRoles, 1);
    expect(actions.doctorSaveUid).toBe('vic');
    expect(actions.witchPoisonUid).toBe('vic');
  });
});

describe('allNightActionsIn', () => {
  it('false until evil, doctor and detective have all submitted', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
    };
    expect(allNightActionsIn(secrets, roles, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(false);
  });

  it('true once all mandatory roles have submitted, regardless of the optional witch', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    expect(allNightActionsIn(secrets, roles, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(true);
  });

  it('a dead mandatory actor is not required to submit', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    // m2 excluded from the alive list entirely (e.g. already eliminated)
    expect(allNightActionsIn(secrets, roles, ['m1', 'doc', 'det', 'vic'], 1)).toBe(true);
  });
});
