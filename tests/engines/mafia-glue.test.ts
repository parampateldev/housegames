import { describe, it, expect } from 'vitest';
import { buildNightActions, allNightActionsIn, type MafiaSecret } from '../../apps/web/src/games/mafia/game';

describe('buildNightActions', () => {
  it('submits one entry per acting player, carrying their own team and behavior', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'Mafia', team: 'evil', behavior: 'kill', nightAction: { round: 1, targetUid: 'vic' } },
      m2: { role: 'Mafia', team: 'evil', behavior: 'kill', nightAction: { round: 1, targetUid: 'vic' } },
      doc: { role: 'Doctor', team: 'town', behavior: 'protect', nightAction: { round: 1, targetUid: 'vic' } },
      det: { role: 'Police', team: 'town', behavior: 'investigate', nightAction: { round: 1, targetUid: 'm1' } },
      vic: { role: 'Townie', team: 'town', behavior: 'none' },
    };
    const submissions = buildNightActions(secrets, 1);
    expect(submissions).toContainEqual({ uid: 'm1', team: 'evil', behavior: 'kill', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'm2', team: 'evil', behavior: 'kill', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'doc', team: 'town', behavior: 'protect', targetUid: 'vic' });
    expect(submissions).toContainEqual({ uid: 'det', team: 'town', behavior: 'investigate', targetUid: 'm1' });
    expect(submissions.some((s) => s.uid === 'vic')).toBe(false); // 'none' never submits
  });

  it('ignores submissions from a previous round', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { role: 'Mafia', team: 'evil', behavior: 'kill', nightAction: { round: 1, targetUid: 'vic' } },
    };
    expect(buildNightActions(secrets, 2)).toHaveLength(0);
  });

  it('a vigilante-style solo-kill role stops submitting once their one shot is used', () => {
    const secrets: Record<string, MafiaSecret> = {
      v: { role: 'Vigilante', team: 'town', behavior: 'solo-kill', nightAction: { round: 2, targetUid: 'vic' }, usedOnce: true },
    };
    expect(buildNightActions(secrets, 2)).toHaveLength(0);
  });

  it('a Mayor-style extra-vote role never submits a night action', () => {
    const secrets: Record<string, MafiaSecret> = {
      mayor: { role: 'Mayor', team: 'town', behavior: 'extra-vote', nightAction: { round: 1, targetUid: 'vic' } },
    };
    expect(buildNightActions(secrets, 1)).toHaveLength(0);
  });
});

describe('allNightActionsIn', () => {
  const secretsBase: Record<string, MafiaSecret> = {
    m1: { role: 'Mafia', team: 'evil', behavior: 'kill' },
    m2: { role: 'Mafia', team: 'evil', behavior: 'kill' },
    doc: { role: 'Doctor', team: 'town', behavior: 'protect' },
    det: { role: 'Police', team: 'town', behavior: 'investigate' },
    vic: { role: 'Townie', team: 'town', behavior: 'none' },
  };

  it('false until kill, protect and investigate have all submitted', () => {
    const secrets = { ...secretsBase, m1: { ...secretsBase.m1, nightAction: { round: 1, targetUid: 'vic' } } };
    expect(allNightActionsIn(secrets, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(false);
  });

  it('true once all mandatory behaviors have submitted, regardless of the optional solo-kill or no-power roles', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { ...secretsBase.m1, nightAction: { round: 1, targetUid: 'vic' } },
      m2: { ...secretsBase.m2, nightAction: { round: 1, targetUid: 'vic' } },
      doc: { ...secretsBase.doc, nightAction: { round: 1, targetUid: 'vic' } },
      det: { ...secretsBase.det, nightAction: { round: 1, targetUid: 'm1' } },
      vic: secretsBase.vic,
    };
    expect(allNightActionsIn(secrets, ['m1', 'm2', 'doc', 'det', 'vic'], 1)).toBe(true);
  });

  it('a dead mandatory actor is not required to submit', () => {
    const secrets: Record<string, MafiaSecret> = {
      m1: { ...secretsBase.m1, nightAction: { round: 1, targetUid: 'vic' } },
      doc: { ...secretsBase.doc, nightAction: { round: 1, targetUid: 'vic' } },
      det: { ...secretsBase.det, nightAction: { round: 1, targetUid: 'm1' } },
    };
    // m2 excluded from the alive list entirely (e.g. already eliminated)
    expect(allNightActionsIn(secrets, ['m1', 'doc', 'det', 'vic'], 1)).toBe(true);
  });
});
