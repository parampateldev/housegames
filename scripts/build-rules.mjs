#!/usr/bin/env node
// Generates database.rules.json from ONE template, applied identically to
// every game namespace. Twelve hand-copied rule blocks is exactly how a
// typo in block #9 slips through review — generating them removes that
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
  // the key) without widening any rule beyond one more dynamic uid lookup —
  // same shape as hostId's own lookup, so it follows role rotation exactly
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

const rules = {
  rules: {
    users: {
      $uid: {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': 'auth != null && auth.uid === $uid',
      },
    },
    ...Object.fromEntries(NAMESPACES.map((ns) => [ns, gameRules(ns)])),
  },
};

writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
console.log(`Wrote database.rules.json for ${NAMESPACES.length} namespaces.`);
