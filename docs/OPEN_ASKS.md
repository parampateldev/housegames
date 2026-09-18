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

## Known deliberate simplifications (not bugs, just scoped down under time pressure)
- Local (phoneless) players: fully supported at the lobby level (add,
  remove, promote to host) in every game. Host-side "submit on their
  behalf" is wired for Empire's word submission and a few other games'
  central action; not every single phase of every game proxies a local
  player's turn. A local player can always still be walked through their
  turn verbally at the table.
- Secret Hitler ships without executive powers (investigate/execute/
  special election) for v1, just the core election-and-legislative loop.

## Housekeeping
- [x] Pushed to GitHub after every meaningful change; CI green throughout
