# Jumpit

Jumpit is an original mobile-first storybook platform game for kids. Slide on the left
side to run, tap on the right side to jump, find lantern seeds, and carry light through
five grounded places. Jumpit is landscape only by design: turn the phone sideways and
Home and play both fill the wide screen so the next jump stays visible. Held upright,
a rotate gate names the game, keeps a paused trail safe, and waits for the turn.

v2.0.0 completes all 20 trails across Garden Walk, Rooftop Rain,
Workshop Loft, Lantern Market, and Beacon Keep. Its short First Light opening leads
into five optional Hidden Lights, one in each place, without turning discovery into
a gate or an up-front checklist. The seven canvas images ship as selectively loaded WebPs.
The exact v1.9 installed client upgrades into one coherent v2.0 cache, and preview builds
replace older same-version shells. One shared
fixed-step transition powers live play, deterministic trail replays, and five separate
discovery replays.

Play the current v2.0.0 release at https://jumpit.royashbrook.com/.

The gameplay borrows genre verbs, not somebody else's identity. Jumpit contains
no Nintendo characters, names, art, music, sounds, trade dress, or copied maps.

> no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.

## Local

Development uses Svelte 5, strict TypeScript and Vite on Node 22.18 or newer. The canvas
renderer and fixed-step game simulation remain separate from the UI. The migration status
and compatibility evidence are in [docs/migration.md](docs/migration.md).

```sh
npm ci
npm run dev
npm test
npm run test:e2e
npm run check
npm run build
npm run serve
```

`serve` opens the built artifact on port 4391. Browser tests use the production artifact
there and an isolated test-only shell on port 4392, override them with `JUMPIT_PORT` and
`JUMPIT_HARNESS_PORT` when running a second checkout. The test shell never ships.

Historical tags remain unchanged. New releases use `vMAJOR.MINOR` milestone tags on the
first-parent history, with the patch equal to every commit since the milestone. Local builds
carry `-dev`; `RELEASE_BUILD=1 npm run build` refuses a dirty or shallow checkout or missing
milestone. The build records exact source and content identity in `version.json`. Both
deployment paths check strict types, emitted files, unit regressions and Chromium/WebKit
before publishing the current main tip. The full roadmap remains in `docs/ROADMAP.md`.
