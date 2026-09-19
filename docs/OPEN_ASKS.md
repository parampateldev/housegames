# Open asks and their status

Tracking the mid-build requests that came in after the initial 12-game platform
was deployed, so nothing gets dropped under time pressure. Newest at top.

## Empire: "still not able to edit the empire map"
The undo bar only reaches the single most recent capture, and only for
one made after that feature shipped, so it couldn't touch mistakes
already baked into an in-progress game (the exact case the user hit:
several existing captures, made before this code existed, that they now
wanted to fix). Added a general "Fix a mistake on the map" host panel,
independent of capture history entirely: pick any player, set them
Independent or Captured by any other current leader, Apply fix. Works
regardless of how many captures deep the mistake is, and correctly
reopens a game a mistaken capture had won. Live-reproduced a 3-captures-deep
scenario and fixed the 2nd one, confirming the 1st and 3rd captures were
left untouched and the game correctly returned to "playing".

## Empire: live map cut off, and no way to fix a mis-recorded capture
- [x] **Map cut off, needed to scroll**: `.empire-map` was constrained to
      the page's 1100px reading-width column like everything else, so on a
      real live game with several leaders the grove of cards overflowed and
      required horizontal scrolling. Made the map break out to the full
      viewport width on screens wide enough for it to matter
      (`@media (min-width: 900px)`, a full-bleed `width:100vw` +
      `transform: translateX(-50%)`), gated so nothing changes below that
      width and the existing mobile-specific bleed is untouched. The
      grove's cards already flex-grow to fill whatever width they get, and
      still fall back to horizontal scroll if a game has more leaders than
      even the full width fits, so this can only ever show more, never less.
- [x] **No way to undo a mis-recorded capture**: added `recordCapture` and
      `undoCapture` (snapshots the target's members before a capture so the
      exact prior state, not just "not eliminated," can be restored, even
      if the target had already absorbed members of its own). The host
      gets a "Last: X captured Y / Undo that" bar after every capture, and
      undoing correctly reopens a game that a mistaken capture had just
      ended.
- [x] Live-reproduced the whole flow (host + 5 local players, real
      captures, real undo) against the actual local Firebase project and
      caught a real bug doing it: Firebase drops an empty array on write,
      so undoing a capture of a player who had zero members of their own
      read back `targetMembersBefore` as `undefined`, not `[]`, and threw.
      Fixed with the same defensive-guard pattern used for this exact bug
      class earlier (Mafia/Werewolf/CAH), with a regression test.

## Host display name: "Host" instead of the name I typed
- [x] **Root cause**: `ensureProfile` is create-once (skips writing if a
      profile already exists). On email sign-up, `onAuthStateChanged` fires
      with the new user as soon as the account is created, before
      `updateProfile(cred.user, {displayName})` (a separate, later await)
      has applied the real name, so the generic auth-state effect's
      `ensureProfile(uid, user.displayName ?? 'Host')` can win the race and
      permanently lock in `'Host'`, since nothing ever revisited it after.
      Reproduced live: a fresh email sign-up showed "Hosting as Host".
- [x] Fixed the race: added `upsertDisplayName` (unconditionally sets the
      name, creating the profile if missing, unlike the create-once
      `ensureProfile`), called right after `signUpEmail` resolves so the
      name the host actually typed always wins regardless of ordering.
- [x] Also removed the crown emoji (`👑`) next to the host's name across
      every game, per request; `PlayerList` and CAH's scoreboard now show
      a plain "(host)" suffix instead, so host status doesn't just vanish.
- [x] Added a real fix for existing accounts already stuck on "Host" (or
      anyone who just wants a different display name): an "Edit name"
      control on the account screen, backed by the same `upsertDisplayName`.
      Verified end-to-end: renamed via the account screen, then hosted a
      real Empire room and confirmed the new name appears in the player list.

## Rebrand and Google Material retheme
- [x] Retheme to a Google Material 3 look (from the user's `quant-lab`
      reference), applied almost entirely through `packages/shared-ui/src/tokens.css`
      so no per-game CSS needed touching
- [x] Renamed the site to **Jestr** (went through "Huddl", dropped for
      colliding with an existing sports-analytics company, then "Mingl",
      dropped by the user with no reason given, before landing on Jestr
      from a shortlist). The GitHub repo and deployed URL path
      (`/housegames/`) are deliberately left as-is, lower-risk than
      touching the live URL
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

## Real Google-product dashboard, not just retheme colors
The first retheme only swapped color/shadow tokens, the actual layout (a
giant poster hero, italic display type, hard-offset shadows) still read as
the old editorial site, not a Google product, which is what the user
pointed at directly (`quant-lab`'s dashboard). Rebuilt the Home page to
match `quant-lab`'s actual structure, not just its palette:
- [x] Real sticky app bar (64px, white, bottom border) with a Google-style
      multi-color-letter wordmark and a product badge pill, replacing the
      plain text header
- [x] A bordered "banner" card (title, description, stat pills) replacing
      the full-height poster hero
- [x] A proper card grid: each game gets a colored Material Symbols icon
      badge, a plain bold title (not italic), a tag chip, and a "Play ->"
      action link, replacing the flat cards with a hard offset shadow
- [x] Loaded the real Material Symbols Outlined icon font (same one
      `quant-lab` uses) instead of emoji or no icon at all
- [x] Swept the one other leftover hard-offset shadow (Pictionary's
      canvas) to the same soft elevation as everywhere else
- Scoped down: each game's own pre-join "hero" screen (e.g. Mafia's
  "Trust no one") keeps its existing italic-accent identity per game,
  only the shared dashboard/app-shell chrome was rebuilt. Revisit if the
  user wants that carried into the games themselves too.

## Mafia: full custom role editor ("I don't even know what vigilante is")
The first pass only let the host toggle a fixed handful of preset roles
on/off. The ask was for real customization: rename/retype roles, add and
remove them freely, and a "create a role" button. Rebuilt the whole
role system around it:
- [x] Generalized the shared elimination engine from a closed set of five
      named roles to a `behavior`-driven model (`kill`, `solo-kill`,
      `poison`, `investigate`, `protect`, `extra-vote`, `none`); a role is
      now just a host-typed name plus a team plus one or more behaviors,
      not a fixed identity the engine has to know about in advance
- [x] Mafia's lobby has a real role editor: presets (Mafia, Police,
      Doctor, Vigilante, Mayor, Townie) to quick-add, a count stepper and
      remove button per role, and a "+ Create a role" form (name, town or
      mafia team, one of the six behaviors) for anything the presets don't
      cover. Live validation blocks starting until the roster adds up to
      exactly the player count with at least one mafia-team role that
      can't start equal to or outnumbering the town
- [x] Added Mayor (`extra-vote`: no night power, day vote counts twice)
      as a new behavior, on top of Vigilante from the earlier pass
- [x] Renamed Detective/Villager to Police/Townie by default, per the ask,
      while presets stay fully renameable/removable since names are just
      host-typed text now
- [x] Werewolf was migrated onto the same generalized engine (it keeps its
      own fixed roster, not the free-form editor) since both games share
      one engine; its Witch (two behaviors on one role: protect + poison,
      the poison unblockable unlike Vigilante's solo-kill) verified this
      migration doesn't collapse the "one role, two independent powers"
      case down to "one behavior per role"
- [x] Live-reproduced full Mafia and Werewolf games end-to-end (role
      assignment, night actions, resolve, day, vote, resolve, game over)
      against the real local Firebase project after the rewrite

## Bugs found via that live reproduction, not code review
- [x] **`votes` node could never be cleared.** `startVote`/`resolveVote`
      call `remove()` on the whole `.../rooms/$room/votes` node, but the
      generated rules only ever granted `.write` on `votes/$uid`, one
      level too deep, Firebase doesn't grant a parent-path write just
      because every child would itself allow it. Result: "Start the vote"
      silently failed with `permission_denied` in Mafia AND Werewolf,
      apparently since this pattern was introduced, never caught before
      because no test (unit, rules-emulator, or manual) had ever clicked
      through an entire game to the vote phase. Fixed by adding a host-only
      `.write` at the `votes` node itself in `build-rules.mjs`, redeployed
      to the live project, regression-tested in the emulator suite.
- [x] **Dead players never showed as eliminated.** The shared `PlayerList`
      component only checked `p.eliminated`; Mafia, Werewolf, and Secret
      Hitler's player type uses `alive` instead, so their roster never
      struck through anyone even after they died. Fixed by having
      `PlayerList` accept either shape.

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
