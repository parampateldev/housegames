import { describe, it, expect } from 'vitest';
import { buildNightActions, allNightActionsIn, type WerewolfSecret, type WerewolfRoleId } from '../../apps/web/src/games/werewolf/game';

const roles: Record<string, WerewolfRoleId> = {
  m1: 'evil', m2: 'evil', doc: 'doctor', det: 'detective', vic: 'villager',
};

describe('buildNightActions', () => {
  it('submits one entry per acting player, tagged with their behavior and team', () => {
    const secrets: Record<string, WerewolfSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    const submissions = buildNightActions(secrets, roles, 1);
    expect(submissions).toContainEqual({ uid: 'm1', team: 'evil', behavior: 'kill', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'm2', team: 'evil', behavior: 'kill', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'doc', team: 'town', behavior: 'protect', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'det', team: 'town', behavior: 'investigate', targetUid: 'm1' });
  });

  it('ignores submissions from a previous round', () => {
    const secrets: Record<string, WerewolfSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
    };
    const submissions = buildNightActions(secrets, roles, 2);
    expect(submissions).toHaveLength(0);
  });

  it('witch poison is read from the separate nightPoison field, as its own independent submission', () => {
    const witchRoles: Record<string, WerewolfRoleId> = { w: 'witch', vic: 'villager' };
    const secrets: Record<string, WerewolfSecret> = {
      w: {
        role: 'witch',
        nightAction: { round: 1, targetUid: 'vic' }, // her save
        nightPoison: { round: 1, targetUid: 'vic' }, // her poison, same or different target
      },
    };
    const submissions = buildNightActions(secrets, witchRoles, 1);
    expect(submissions).toContainEqual({ uid: 'w', team: 'town', behavior: 'protect', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'w', team: 'town', behavior: 'poison', targetUid: 'vic' });
  });
});

describe('allNightActionsIn', () => {
  it('false until evil, doctor and detective have all submitted', () => {
    const secrets: Record<string, WerewolfSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
    };
    expect(allNightActionsIn(secrets, roles, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(false);
  });

  it('true once all mandatory roles have submitted, regardless of the optional witch', () => {
    const secrets: Record<string, WerewolfSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    expect(allNightActionsIn(secrets, roles, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(true);
  });

  it('a dead mandatory actor is not required to submit', () => {
    const secrets: Record<string, WerewolfSecret> = {
      m1: { role: 'evil', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'doctor', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'detective', nightAction: { round: 1, targetUid: 'm1' } },
    };
    // m2 excluded from the alive list entirely (e.g. already eliminated)
    expect(allNightActionsIn(secrets, roles, ['m1', 'doc', 'det', 'vic'], 1)).toBe(true);
  });
});
