# typed app migration

tracking: [#24](https://github.com/royashbrook/jumpit/issues/24).
status: baseline and implementation plan, not shipped.

## preserve the game

baseline: `25abd61230184517c85a7b5f381ad25988c81989`.
the source, rules, twenty trails, five hidden lights, artwork and synthesized music are the
behavior reference. this is an architecture change, not a redesign or a physics update.

Svelte owns the menu, HUD, settings, dialogs and browser lifecycle. the existing Canvas 2D
runtime keeps its 60 Hz fixed-step simulation and rendering. TypeScript makes the level,
input, state, event, save and controller boundaries explicit. Vite builds the actual release
into `build/`. SvelteKit, a router and a new game engine do not solve a current need here.

## sequence and evidence

1. record the old build before editing application code. run unit/content checks and
   artifact Playwright, capture independent replay results and saves, and prove the baseline
   tests reject deliberate behavior changes.
2. type the existing pure engine and canvas/audio controllers without changing arithmetic,
   event order, authored tuples or timing. compare the independent outcomes, not merely a
   new implementation replayed against itself.
3. replace imperative DOM ownership with Svelte state and markup. retain control IDs and
   semantics, pointer-source ownership, stick hysteresis, assistive clicks, focus, modal and
   landscape behavior. Svelte does not observe every simulation tick.
4. replace the copying/minification pipeline with Vite. keep strict checking independent
   of TS execution, run tests against emitted output, and generate worker dependencies and
   distribution notices from that output.
5. prove installed updates and data retention, then get an independent cold review and a
   real-control playtest. deploy only a checked exact source, verify its live build, and
   record the house evidence map here or on the issue.

## compatibility boundaries

- origin, manifest `id`, `start_url` and `scope` (`./`), installed name/icons, `sw.js` URL.
- `jumpit-save-v1`, current v3 schema, every level/hidden-light ID, best scores, unlocks,
  daily stamps, chosen look, sound preference and learned controls. no reset or reinstall.
- old `version.js?update-probe` consumers and `jumpit:generation` messages. new builds use
  a content fingerprint shared by app/worker plus exact source metadata. preserve all old
  tags and choose a non-regressing `vMAJOR.MINOR` anchor for the release.
- complete candidate download before activation, explicit update action, usable old clients
  after failed downloads, offline cold start, subpath scope and the historical v1.5 bridge.
- lazy art decode on first play, original image bytes and licensing, reduced motion,
  background pause, audio gesture requirements and no implicit resume on focus return.

mount/unmount must dispose RAFs, image/window listeners, held input, audio, update timers and
install listeners. `stop` alone does not currently dispose every listener. a new `#app`
wrapper also changes the old direct-child orientation CSS, so layout needs actual browser
checks after the move.

## retain the meaning of the tests

several current browser tests replace `game.js` or `audio.js` by URL. hashed bundles remove
those accidental seams. move isolated shell state tests to an explicit test boundary and
keep real production controls in artifact tests. do not leave unmatched routes, expose a
production debug global, or drop the checks to make bundling pass.

source-only shell assertions and the fixed 28-file build list must become rendered-UI and
emitted-graph assertions. historical worker fixtures remain byte-pinned. version policy
tests cover first-parent anchors, merged commits, misleading side tags, missing/invalid
anchors and shallow/dirty release failures. notices must render both online and offline.

## baseline measured so far

- `npm test`: 116 passed, including the current production builder.
- `npm run build`: 28 release files emitted.
- twenty campaign and five hidden-light simulation witnesses finish. expanded level JSON
  SHA-256: `d6c068f474b9b99cedd5e2785222e021e3d0db4d70b017d5ba95e305bd54d032`.
- browser baseline, independent mutation score and installed migration: pending. no new
  release, device improvement or product-quality claim follows from these unit results.
