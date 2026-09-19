import { describe, it, expect } from 'vitest';
import { mk, capture, recordCapture, undoCapture, winner } from '../../apps/web/src/games/empire/game';

describe('undoCapture, reversing a host mis-click', () => {
  it('restores a simple one-on-one capture exactly', () => {
    const players = { a: mk('a', 'Alice'), b: mk('b', 'Bob') };
    const record = recordCapture('a', 'b', players);
    const captured = capture(players, 'a', 'b');
    const restored = undoCapture(captured, record);
    expect(restored).toEqual(players);
  });

  it("restores the target's own empire, not just the target alone", () => {
    // Bob had already captured Carol before Alice captures Bob.
    const base = { a: mk('a', 'Alice'), b: mk('b', 'Bob'), c: mk('c', 'Carol') };
    const bobsEmpire = capture(base, 'b', 'c'); // Bob leads Carol
    const record = recordCapture('a', 'b', bobsEmpire);
    const aliceWins = capture(bobsEmpire, 'a', 'b'); // Alice takes Bob's whole empire
    expect(aliceWins.a.members.sort()).toEqual(['b', 'c']);

    const restored = undoCapture(aliceWins, record);
    expect(restored).toEqual(bobsEmpire);
    expect(restored.b.eliminated).toBe(false);
    expect(restored.b.members).toEqual(['c']);
    expect(restored.c.eliminated).toBe(true);
    expect(restored.c.leaderId).toBe('b');
  });

  it('only strips what THIS capture actually granted, if the attacker gained members some other way in between', () => {
    const base = { a: mk('a', 'Alice'), b: mk('b', 'Bob'), c: mk('c', 'Carol'), d: mk('d', 'Dana') };
    const record = recordCapture('a', 'b', base);
    let players = capture(base, 'a', 'b'); // Alice takes Bob
    players = capture(players, 'a', 'c'); // Alice separately takes Carol too
    const restored = undoCapture(players, record);
    // Bob is freed, but Carol (captured afterward, unrelated to this record) stays captured.
    expect(restored.b.eliminated).toBe(false);
    expect(restored.a.members).toEqual(['c']);
    expect(restored.c.eliminated).toBe(true);
  });

  it('reverses a capture that had just ended the game', () => {
    const players = { a: mk('a', 'Alice'), b: mk('b', 'Bob') };
    const record = recordCapture('a', 'b', players);
    const captured = capture(players, 'a', 'b');
    expect(winner(captured)?.id).toBe('a');
    const restored = undoCapture(captured, record);
    expect(winner(restored)).toBeNull();
  });

  it('handles targetMembersBefore missing entirely, the shape it actually comes back in after a Firebase round-trip (empty arrays are dropped on write)', () => {
    const players = { a: mk('a', 'Alice'), b: mk('b', 'Bob') };
    const captured = capture(players, 'a', 'b');
    // Simulates reading the record back from Firebase: the empty array field is gone, not [].
    const recordAsReadBack = { attackerId: 'a', targetId: 'b', at: Date.now() } as unknown as { attackerId: string; targetId: string; targetMembersBefore: string[]; at: number };
    const restored = undoCapture(captured, recordAsReadBack);
    expect(restored).toEqual(players);
  });

  it('throws if a player named in the record no longer exists', () => {
    const players = { a: mk('a', 'Alice'), b: mk('b', 'Bob') };
    const record = recordCapture('a', 'b', players);
    const captured = capture(players, 'a', 'b');
    delete (captured as Record<string, unknown>).b;
    expect(() => undoCapture(captured, record)).toThrow();
  });
});
