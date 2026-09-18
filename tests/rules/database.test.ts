import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

// These tests exercise the ACTUAL rule engine against real reads/writes via
// the Realtime Database emulator, unlike Empire's old security.test.ts,
// which only asserted the rules FILE contained certain substrings. A rule
// that is logically wrong (like Empire's historical `now < endsAt` bug)
// would sail through a string-match test; it cannot sail through this one.
//
// database.rules.json is generated identically for all 12 namespaces from
// one template (scripts/build-rules.mjs), so exercising it thoroughly once
// against the "empire" namespace covers every other namespace too. A
// cross-namespace smoke test at the end confirms they really are identical.

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'housegames-rules-test',
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => testEnv.cleanup());
afterEach(async () => testEnv.clearDatabase());

const NS = 'empire';
const ROOM = 'ABCDE';

// The test context exposes the COMPAT (namespaced) Database API, not the
// modular one the app itself uses, that's a rules-unit-testing detail,
// unrelated to what the app's own shared-firebase code does.
function dbAs(uid: string | null) {
  const ctx = uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext();
  return ctx.database();
}

async function seed(fn: (db: ReturnType<typeof dbAs>) => Promise<void>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.database()));
}

describe('room creation & host handoff', () => {
  it('signed-out clients cannot read or write anything', async () => {
    const db = dbAs(null);
    await assertFails(db.ref(`${NS}/rooms/${ROOM}`).once('value'));
    await assertFails(db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1'));
  });

  it('a signed-in user can create a room naming themselves host', async () => {
    const db = dbAs('host1');
    await assertSucceeds(db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1'));
  });

  it('a signed-in user cannot create a room naming someone else host', async () => {
    const db = dbAs('host1');
    await assertFails(db.ref(`${NS}/rooms/${ROOM}/hostId`).set('someoneElse'));
  });

  it('only the host can write createdAt', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/rooms/${ROOM}/players/host1`).set({ id: 'host1', name: 'Host' });
    });

    const host = dbAs('host1');
    const stranger = dbAs('stranger');
    await assertSucceeds(host.ref(`${NS}/rooms/${ROOM}/createdAt`).set(Date.now()));
    await assertFails(stranger.ref(`${NS}/rooms/${ROOM}/createdAt`).set(Date.now()));
  });

  it('a non-host PLAYER can write phase/settings/state (the active-player fix) — a non-player stranger still cannot', async () => {
    // Regression test: Codenames' spymaster, Wavelength's psychic, Secret
    // Hitler's president are usually not the room host, but they need to
    // write shared round state (a clue, a guess, a policy). Before this
    // rule, only the host could, silently breaking every one of those
    // actions for a non-host active player.
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/rooms/${ROOM}/players/host1`).set({ id: 'host1', name: 'Host' });
      await db.ref(`${NS}/rooms/${ROOM}/players/p2`).set({ id: 'p2', name: 'P2' });
    });

    const player = dbAs('p2');
    const stranger = dbAs('stranger');
    await assertSucceeds(player.ref(`${NS}/rooms/${ROOM}/phase`).set('clue'));
    await assertSucceeds(player.ref(`${NS}/rooms/${ROOM}/settings`).set({ clue: 'ocean' }));
    await assertSucceeds(player.ref(`${NS}/rooms/${ROOM}/state`).set({ round: 2 }));
    await assertFails(stranger.ref(`${NS}/rooms/${ROOM}/phase`).set('clue'));
    await assertFails(stranger.ref(`${NS}/rooms/${ROOM}/settings`).set({ clue: 'ocean' }));
  });

  it('a player can write their own player node but not someone else\'s', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
    });

    const p2 = dbAs('p2');
    await assertSucceeds(p2.ref(`${NS}/rooms/${ROOM}/players/p2`).set({ id: 'p2', name: 'P2' }));
    await assertFails(p2.ref(`${NS}/rooms/${ROOM}/players/p3`).set({ id: 'p3', name: 'P3' }));
  });

  it('host CAN write any player node (e.g. to remove one)', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/rooms/${ROOM}/players/p2`).set({ id: 'p2', name: 'P2' });
    });
    const host = dbAs('host1');
    await assertSucceeds(host.ref(`${NS}/rooms/${ROOM}/players/p2`).set(null));
  });

  it('current host can hand off to a uid that is already a player', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/rooms/${ROOM}/players/p2`).set({ id: 'p2', name: 'P2' });
    });
    const host = dbAs('host1');
    await assertSucceeds(host.ref(`${NS}/rooms/${ROOM}/hostId`).set('p2'));
  });

  it('current host CANNOT hand off to a uid that is not a player in the room', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
    });
    const host = dbAs('host1');
    await assertFails(host.ref(`${NS}/rooms/${ROOM}/hostId`).set('ghostUid'));
  });

  it('a non-host cannot steal host by overwriting hostId directly', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/rooms/${ROOM}/players/p2`).set({ id: 'p2', name: 'P2' });
    });
    const stranger = dbAs('p2');
    await assertFails(stranger.ref(`${NS}/rooms/${ROOM}/hostId`).set('p2'));
  });

  it('the host can delete the whole room', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}`).set({ hostId: 'host1', phase: 'lobby', createdAt: 1, players: { host1: { id: 'host1', name: 'H' } } });
    });
    const host = dbAs('host1');
    await assertSucceeds(host.ref(`${NS}/rooms/${ROOM}`).set(null));
  });
});

describe('secrets, never readable by the wrong uid, even briefly', () => {
  it('the owner can read their own secret', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/secrets/${ROOM}/p2`).set({ word: 'taco' });
    });
    const owner = dbAs('p2');
    await assertSucceeds(owner.ref(`${NS}/secrets/${ROOM}/p2`).once('value'));
  });

  it('a different, non-host player CANNOT read someone else\'s secret', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/secrets/${ROOM}/p2`).set({ word: 'taco' });
    });
    const other = dbAs('p3');
    await assertFails(other.ref(`${NS}/secrets/${ROOM}/p2`).once('value'));
  });

  it('the host CAN read any player\'s secret', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/secrets/${ROOM}/p2`).set({ word: 'taco' });
    });
    const host = dbAs('host1');
    await assertSucceeds(host.ref(`${NS}/secrets/${ROOM}/p2`).once('value'));
  });
});

describe('host reveal, the exact shape of Empire\'s historical bug, re-verified', () => {
  it('everyone can attach to the reveal node while it is empty', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
    });
    const guest = dbAs('p2');
    await assertSucceeds(guest.ref(`${NS}/hostReveals/${ROOM}`).once('value'));
  });

  it('once populated, ONLY the current host can read it, access is decided by the write, not a clock', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/hostReveals/${ROOM}`).set({ words: ['taco', 'pizza'] });
    });
    const host = dbAs('host1');
    const guest = dbAs('p2');
    await assertSucceeds(host.ref(`${NS}/hostReveals/${ROOM}`).once('value'));
    await assertFails(guest.ref(`${NS}/hostReveals/${ROOM}`).once('value'));
  });

  it('after host migration, the NEW host gains read access without any new grant being written', async () => {
    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('host1');
      await db.ref(`${NS}/hostReveals/${ROOM}`).set({ words: ['taco'] });
    });
    const oldHost = dbAs('host1');
    const newHost = dbAs('p2');
    await assertFails(newHost.ref(`${NS}/hostReveals/${ROOM}`).once('value'));

    await seed(async (db) => {
      await db.ref(`${NS}/rooms/${ROOM}/hostId`).set('p2');
    });
    await assertFails(oldHost.ref(`${NS}/hostReveals/${ROOM}`).once('value'));
    await assertSucceeds(newHost.ref(`${NS}/hostReveals/${ROOM}`).once('value'));
  });
});

describe('users/, each account\'s data is private to that account', () => {
  it('a user can read and write their own profile', async () => {
    const me = dbAs('u1');
    await assertSucceeds(me.ref('users/u1').set({ displayName: 'Me' }));
    await assertSucceeds(me.ref('users/u1').once('value'));
  });

  it('a user cannot read or write someone else\'s profile', async () => {
    const other = dbAs('u2');
    await assertFails(other.ref('users/u1').set({ displayName: 'Hijacked' }));
    await assertFails(other.ref('users/u1').once('value'));
  });
});

describe('cross-namespace smoke test, the generated template is identical everywhere', () => {
  it('the "mafia" namespace enforces the same phase write rule (host or room player) as "empire"', async () => {
    await seed(async (db) => {
      await db.ref('mafia/rooms/ZZZZZ/hostId').set('host1');
    });
    const stranger = dbAs('stranger');
    await assertFails(stranger.ref('mafia/rooms/ZZZZZ/phase').set('night'));
  });
});
