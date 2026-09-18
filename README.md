# Jestr

Twelve live-multiplayer party games, one room code away. Live at [parampateldev.github.io/housegames](https://parampateldev.github.io/housegames/) (the repo and URL still say "housegames" -- see the branding note below).

**Games:** Empire, Imposter, Mafia, Werewolf, Secret Hitler, Spyfall, Codenames, Pictionary, Charades, Heads Up, Wavelength, Cards Against Humanity.

Sign in with Google or email to host a room (so it can be saved to your account); anyone else joins as a guest with just a name, no account needed.

**Every game has:** a QR code and copy-link for the room, a Help button with real rules (not filler), and host controls to hand off host, remove a player, or add someone at the table who doesn't have a phone. Signed-in hosts get a dashboard of their recent rooms.

## Architecture

See the [architecture proposal](https://claude.ai/artifact/8UqqgLjjqwKM7TCawNf9pn) for the full design rationale. Summary:

- **One Vite + React + TypeScript app** (`apps/web`) hosts all 12 games behind a shared nav, auth state, and design system, rather than 12 independent builds.
- **Firebase Realtime Database**, namespaced per game (`empire/`, `mafia/`, `codenames/`, ...), with **Firebase Auth** (Google, email/password, anonymous).
- **One security principle, everywhere:** a secret never lives inside a publicly-readable node. It lives at its own path (`$ns/secrets/$room/$uid`), gated per-uid, never widened to a group, never gated on a clock (see `packages/shared-firebase/src/secrets.ts` and the comment in `scripts/build-rules.mjs`). This is the direct fix for a real bug in Empire's history: a rules of the form `now < endsAt` looks reasonable but never re-evaluates as time passes, so a listener attached before the deadline kept reading secret data forever.
- **Public room state (`settings`/`phase`/`state`) is writable by the host or any player currently in the room**, not host-only. A rotating active player (Codenames' spymaster, Wavelength's psychic, Secret Hitler's president) is very often not the room host, and gating those fields to host-only silently broke every one of those actions. Secrets stay strictly per-uid gated regardless.
- **Two shared engines** instead of twelve bespoke implementations:
  - `packages/shared-firebase`, the "secret-reveal" primitive (per-uid gated secrets, host-only aggregate reveals, generic room CRUD with deterministic host migration) used by nearly every game.
  - `packages/game-engines/elimination-engine`, the night-action resolver (role assignment, doctor-save-before-kill ordering, day-vote tally, win check) shared by Mafia and Werewolf.
- **Security rules are generated, not hand-copied** (`scripts/build-rules.mjs` → `database.rules.json`), one template applied identically to all 12 namespaces, so there's no per-game copy-paste drift to typo.
- **`packages/shared-ui`** also has the cross-game chrome: `RoomHeader` (QR/share/dashboard link), `PlayerManager` (host controls), `HelpModal` (per-game rules).

## Repo layout

```
apps/web/src/          the app shell + one folder per game (apps/web/src/games/<slug>/)
packages/shared-ui/     design tokens + shared React components
packages/shared-firebase/  auth, room primitives, the secrets/reveal engine
packages/game-engines/  the Mafia/Werewolf elimination engine
content/                word lists, card decks, prompt datasets
tests/engines/          pure-logic unit tests (vitest)
tests/rules/            security-rules tests against the real Realtime Database emulator
scripts/build-rules.mjs generates database.rules.json from one template
```

## Local development

```bash
npm install
cp .env.example .env   # fill in Firebase web app config from the Firebase console
npm run dev
```

## Testing

```bash
npx tsc --noEmit -p tsconfig.json         # typecheck
npx vitest run --config vitest.config.ts  # game/engine unit tests
npx firebase-tools emulators:exec --only database \
  "npx vitest run --config vitest.rules.config.ts"   # security-rules tests (needs Java)
```

All three run in CI (`.github/workflows/deploy.yml`) before every deploy.

## Deployment

Push to `main` → GitHub Actions runs the full test suite, builds, and deploys to GitHub Pages. Firebase config is injected at build time from repo secrets (`VITE_FIREBASE_*`); nothing sensitive is checked in (the Firebase web API key is safe to expose, access control is enforced entirely by the security rules, not by hiding the key).

## Adding a 13th game

1. `apps/web/src/games/<slug>/`, `game.ts` (pure logic, unit-tested), `firebase.ts` (data layer on `@fb/index`, namespaced), `<slug>.css` (scoped under a short wrapper class so it can never collide with another game's classnames), `index.tsx` (default export, wrapped in `RequireIdentity`).
2. Add the namespace to `NAMESPACES` in `scripts/build-rules.mjs`, re-run it, redeploy rules.
3. Add an entry to `apps/web/src/games/registry.ts`.

No other shared file should need to change, that's the point of the shared engines.
