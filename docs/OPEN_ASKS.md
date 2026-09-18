# Open asks and their status

Tracking the mid-build requests that came in after the initial 12-game platform
was deployed, so nothing gets dropped under time pressure. Newest at top.

## Auth hardening
- [x] Email format validation on sign-up (rejects obviously-fake input,
      client-side before it reaches Firebase)
- [x] Real verification email sent after sign-up (`sendEmailVerification`),
      with a clear "check your inbox" screen
- [x] Confirm-password field (must match to submit)
- [x] Password strength meter (weak / medium / strong, live as you type)
- [x] 6+ character minimum enforced client-side with a clear message

## `auth/unauthorized-domain` on the live site
- [x] Diagnosed: `parampateldev.github.io` isn't in Firebase Auth's authorized
      domains list yet. **Needs the project owner to add it in the Firebase
      console** (Authentication -> Settings -> Authorized domains) -- no CLI
      command manages this list, so this is the one step only you can do.

## Critical bug: non-host active players couldn't write shared round state
- [x] Root cause, fix, regression test, and redeploy. See the "Fix critical
      bug" commit. Confirmed this was breaking Codenames' spymaster clue,
      Wavelength's psychic clue/guess/call, and would have hit Secret
      Hitler's president/chancellor actions too, in any room where the
      active player wasn't also the host.

## Design polish
- [x] Shared `RoomHeader` (QR, copy link, back to dashboard) and
      `PlayerManager` (make host / remove / add a player without a phone)
      wired into all 12 games
- [x] `makeHost` / `addLocalPlayer` primitives in shared-firebase
- [x] Dashboard shows a signed-in host's recent rooms (auto-recorded,
      zero per-game wiring needed)
- [x] Shared `HelpModal` with real, specific rules text wired into all
      12 games (not generic filler, the actual mechanics of each game)
- [x] Responsive CSS hardened for the new shared components (phone-width
      breakpoints)
- [x] Em dash / en dash sweep: zero remain anywhere in the repo (verified
      by a full-repo grep, not just spot-checked)

## Local-player (no-phone) deadlock sweep
Live-reproduced and fixed five real "the game can never proceed" bugs,
each the same root cause: a required active role/office was rendered
only for the currently signed-in identity, with no host-proxy for a
local player holding that role.
- [x] Secret Hitler: nomination, voting, and both legislative discard
      steps now have host-side proxy UI.
- [x] Mafia/Werewolf: a local Doctor/Detective/Mafia/Witch can now have
      their night action submitted by the host, per-role.
- [x] Cards Against Humanity: a local Czar can now judge; a local
      non-Czar player can now submit a card. Both were previously
      permanent blockers since "advance the round" required 100%
      participation.
- [x] Wavelength: a local Psychic's clue-giving UI was fetched but never
      rendered (dead code from the interrupted first pass) -- wired up.
- [x] Imposter: voting requires every player; added host-proxy voting
      per local player, plus a real "guess for them" input (previously
      just a blank "they pass").
- Verified Spyfall (host has a manual "reveal result" override) and
  Codenames' team-guess step (a team-wide action, not a single office)
  don't have this failure mode.

## Firebase empty-array crash (found via live reproduction)
- [x] Realtime Database drops a field written as `[]` entirely -- it
  comes back `undefined` on read, not `[]`. This crashed Secret Hitler
  outright (`role.teammates.length` for any Liberal) and was a latent
  crash waiting to happen in Mafia/Werewolf (`lastDeaths` whenever
  nobody died) and CAH (`reveals` between rounds). All three now guard
  with `?.` / `?? []` before touching `.length`/`.map`/`.join`. This is
  a systemic pattern worth remembering for any future array field.

## Known deliberate simplifications (not bugs, just scoped down under time pressure)
- Secret Hitler ships without executive powers (investigate/execute/
  special election) for v1, just the core election-and-legislative loop.

## Housekeeping
- [x] Pushed to GitHub after every meaningful change; CI green throughout
- [x] Live-tested Empire, Mafia, Secret Hitler, Codenames, and Pictionary
  end to end against the real deployed site and real Firebase backend,
  not just typecheck/unit tests -- this is how the deadlock and
  empty-array bugs above were actually found.
