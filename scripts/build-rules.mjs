#!/usr/bin/env node
// Generates database.rules.json from ONE template, applied identically to
// every game namespace. Twelve hand-copied rule blocks is exactly how a
// typo in block #9 slips through review, generating them removes that
// failure mode entirely. Re-run after editing this file; never hand-edit
// database.rules.json directly.
import { writeFileSync } from 'node:fs';

const NAMESPACES = [
  'empire', 'imposter', 'mafia', 'werewolf', 'secretHitler', 'spyfall',
  'codenames', 'pictionary', 'charades', 'headsUp', 'wavelength', 'cah',
];

function gameRules(ns) {
  const hostOnly = `root.child('${ns}/rooms/'+$room+'/hostId').val() === auth.uid`;
  // A round can hand a NON-host player temporary privileged visibility (the
  // CAH czar reading anonymized submissions, a Codenames spymaster reading
  // the key) without widening any rule beyond one more dynamic uid lookup, // same shape as hostId's own lookup, so it follows role rotation exactly
  // the way host access already follows host migration. Only the host may
  // set who currently holds it.
  const privilegedOnly = `root.child('${ns}/rooms/'+$room+'/privilegedUid').val() === auth.uid`;
  const hostOrPrivileged = `(${hostOnly} || ${privilegedOnly})`;
  return {
    rooms: {
      $room: {
        '.read': 'auth != null',
        hostId: {
          // Same handoff guard as Empire: create with yourself as host, or
          // hand off to a uid that's already a player in the room.
          '.write': `auth != null && ((!data.exists() && newData.val() === auth.uid) || (data.val() === auth.uid && newData.exists() && newData.val() !== auth.uid && newData.parent().child('players/'+newData.val()).exists()))`,
        },
        privilegedUid: { '.write': `auth != null && ${hostOnly}` },
        phase: { '.write': `auth != null && ${hostOnly}` },
        createdAt: { '.write': `auth != null && ${hostOnly}` },
        settings: { '.write': `auth != null && ${hostOnly}` },
        // Catch-all for whatever public, non-secret round state a given game
        // needs (deck pointers, election tracker, board, current word queue,
        // ...) that doesn't fit hostId/phase/createdAt/settings/players/votes.
        // Without an explicit rule here, a partial write to an undeclared
        // field silently falls through to the room-level create/delete-only
        // rule and gets denied, this exists so no game has to discover that
        // the hard way.
        state: { '.write': `auth != null && ${hostOnly}` },
        players: {
          $uid: { '.write': `auth != null && (auth.uid === $uid || ${hostOnly})` },
        },
        votes: {
          $uid: { '.write': `auth != null && (auth.uid === $uid || ${hostOnly})` },
        },
        '.write': `auth != null && ((!data.exists() && newData.child('hostId').val() === auth.uid) || (!newData.exists() && data.child('hostId').val() === auth.uid))`,
      },
    },
    secrets: {
      $room: {
        $uid: {
          '.read': `auth != null && (auth.uid === $uid || ${hostOrPrivileged})`,
          '.write': `auth != null && (auth.uid === $uid || ${hostOrPrivileged})`,
        },
      },
    },
    hostReveals: {
      $room: {
        '.read': `auth != null && (!data.exists() || ${hostOrPrivileged})`,
        '.write': `auth != null && ${hostOrPrivileged}`,
      },
    },
  };
}

// Per-namespace additions that don't fit the generic template. Drawing
// strokes aren't secret (only Pictionary's current word is, via the normal
// secrets/ path), any signed-in room member may read/write them.
const NAMESPACE_EXTRAS = {
  pictionary: {
    strokes: {
      $room: {
        $round: {
          '.read': 'auth != null',
          '.write': 'auth != null',
        },
      },
    },
  },
};

const rules = {
  rules: {
    users: {
      $uid: {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': 'auth != null && auth.uid === $uid',
      },
    },
    ...Object.fromEntries(NAMESPACES.map((ns) => [
      ns,
      { ...gameRules(ns), ...(NAMESPACE_EXTRAS[ns] ?? {}) },
    ])),
  },
};

writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
console.log(`Wrote database.rules.json for ${NAMESPACES.length} namespaces.`);
