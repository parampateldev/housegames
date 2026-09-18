# Open asks and their status

Tracking the mid-build requests that came in after the initial 12-game platform
was deployed, so nothing gets dropped under time pressure. Newest at top.

## Rebrand and Google Material retheme
- [x] Retheme to a Google Material 3 look (from the user's `quant-lab`
      reference), applied almost entirely through `packages/shared-ui/src/tokens.css`
      so no per-game CSS needed touching
- [x] Renamed the site to **Mingl** (was briefly "Huddl", dropped after the
      user flagged it collides with an existing sports-analytics company).
      The GitHub repo and deployed URL path (`/housegames/`) are deliberately
      left as-is, lower-risk than touching the live URL
- [x] Fixed the invisible "Copy link" button: `.hg-mini-btn`'s hardcoded
      ink-colored text was invisible against `.hg-share-bar`'s dark
      background, scoped a light-text override to that context
- [ ] `auth/unauthorized-domain` still reported for Google sign-in on the
      live site specifically. `accounts:createAuthUri` succeeds for both
      the github.io and localhost domains, and Google sign-in works cleanly
      on localhost, so the general authorized-domains setup looks correct;
      unconfirmed whether this is a stale cache on the reporter's end or a
      real gap (e.g. the Google Cloud OAuth client's own "Authorized
      JavaScript origins" list, separate from Firebase's domain list).
      Needs a hard-refresh retry and the exact error text/domain to pin down.

## Mafia host customization
- [x] Host can set the mafia count and toggle Doctor / Detective / Vigilante
      on or off from the lobby, before starting the game (`buildMafiaRoles`,
      `recommendedMafiaOptions` in the elimination engine); villagers fill
      whatever's left, with validation so mafia can never start equal to or
      outnumbering the town
- [x] Added a Vigilante role (one bullet for the whole game, blockable by
      the doctor same as the mafia's own kill) as a common, standard option
      for larger rooms; replaced a copy-pasted-from-Werewolf Witch branch
      that mafia's role table could never actually produce

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
