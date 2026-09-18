# Open asks and their status

Tracking the mid-build requests that came in after the initial 12-game platform
was deployed, so nothing gets dropped under time pressure. Newest at top.

## Auth hardening (in progress)
- [ ] Email format validation on sign-up (reject obviously-fake input)
- [ ] Send a real verification email after sign-up (`sendEmailVerification`)
- [ ] Confirm-password field (type it twice, must match)
- [ ] Password strength meter (weak / medium / strong)
- [ ] Enforce 6+ character minimum client-side, with a clear message

## `auth/unauthorized-domain` on the live site
- [x] Diagnosed: `parampateldev.github.io` isn't in Firebase Auth's authorized
      domains list yet. **Needs the project owner to add it in the Firebase
      console** (Authentication -> Settings -> Authorized domains) -- no CLI
      command manages this list.

## Critical bug: non-host active players couldn't write shared round state
- [x] Root cause: `settings`/`phase`/`state` were host-only writable by rule.
      Any game where the ACTIVE player (Codenames' spymaster, Wavelength's
      psychic, Secret Hitler's president) isn't the room host had that
      player's actions silently rejected by the security rules.
- [x] Fixed centrally in `scripts/build-rules.mjs`: `settings`/`phase`/`state`
      now allow the host OR any player currently in the room. Secrets remain
      strictly per-uid gated, unaffected.
- [x] Regression test added in `tests/rules/database.test.ts` proving a
      non-host room member can write, and a non-member stranger still cannot.
- [x] Redeployed to production, emulator suite passing (20/20).

## Design polish (in progress)
- [x] Shared `RoomHeader` (QR + copy-link + back-to-dashboard) component
- [x] Shared `PlayerManager` (make host / remove / add player without a
      phone) component
- [x] `makeHost` / `addLocalPlayer` primitives in shared-firebase
- [x] Dashboard shows a signed-in host's recent rooms (auto-recorded by
      createRoom/joinRoom, zero per-game wiring needed)
- [ ] `RoomHeader` + `PlayerManager` wired into all 12 games (5 of 12 done:
      Codenames, Pictionary, Charades, Heads Up, Wavelength; remaining 7 need
      the same treatment)
- [ ] Shared `HelpModal` component built; needs real, accurate per-game rules
      text wired into all 12 games (Empire and Imposter already have genuine
      ported help content)
- [x] Responsive CSS audited and hardened for the new shared components
      (phone-width breakpoints in tokens.css / components.css)
- [ ] Em dash / en dash sweep: mostly done across the repo, needs a final
      full-repo grep pass to confirm zero remain

## Housekeeping
- [ ] Keep pushing to GitHub as each piece lands so CI/deploy stays current
