# typed app migration

tracking: [#24](https://github.com/royashbrook/jumpit/issues/24).
status: typed implementation in integration, not shipped.

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
- production-artifact Playwright: 103 passed, one intentional WebKit skip for the
  Chromium-CDP-only two-finger test. isolated server on port 4391.
- independent oracle pinned before the port: 61,528 leaves spanning engine trajectories,
  boundary probes, content, saves, daily/release helpers and synthesized audio. 37/37
  scored mutants caught. it does not cover canvas/DOM/lifecycle or worker upgrades.
- these are baseline measurements, not a new release or a device-improvement claim.

## integration findings

the typed engine matches 19,183 ordered state/event snapshots and 437 malformed validator
inputs. the independent 61,528-leaf recording matches every non-PWA value. the two HTML
identity links gain an equivalent `./` prefix, while the worker generation now comes from
the emitted build fingerprint instead of a hand-maintained suffix. actual worker messages
and the full built precache are checked separately; the old source regex is not an oracle
for a minified worker.

two browser regressions were caught during the port: delegated Svelte click handling did
not mark the left gesture zone as a native touch-adjustment target, and a new page delivered
by the old network-first worker could advertise a backward update. retain the native zone
listener with teardown. at startup, a mismatched controller must be confirmed against the
origin's current build before announcing an update; an actual controller change retains
the existing explicit-tap behavior. neither changes the movement rules.

explicit resilience changes: a denied `localStorage` getter now falls back to memory instead
of throwing before storage handling starts. shell/controller teardown owns listeners,
RAFs, timers, held input and pending audio/install/update work. installed navigation now
uses the complete immutable cached root/index, including query links. exact cached document
paths stay documents; unknown offline paths fail rather than serving the game as a missing
document. old caches remain while old tabs are open and are retired only by a sole matching
current client. the historical v1.5 bridge still runs once, retiring only its marker first.

the shared house checker also found a pre-existing About defect in both artifacts: the three
maker-mark links were only 15px tall. those links now own at least 44x44px each. a browser
test fails before the CSS change in both engines and checks size plus hit ownership in
portrait and landscape. this small touch-target change is separate from gameplay parity.

the original root JS modules and stylesheet are superseded by `src/` and removed
after import/test conversion. they remain recoverable at the baseline SHA and in the exact
installed-client fixtures. the old minifier regression is retained while the release itself
is checked as emitted Vite files. test-only shell factories build into `build-harness/`,
never into the deployed `build/` allowlist.

## integrated verification

- strict Svelte/TypeScript: zero errors and zero warnings.
- 176 unit/build checks pass. artifact Playwright: 113 pass, the same one intentional
  WebKit skip remains. installed-update coverage is 22 passing cases across both engines.
- the real shipped r23 client upgrades to the compiled app only on the update action,
  retaining non-empty progress, sound and look settings. an old second tab keeps its
  module dependencies. failed candidate downloads leave the old game usable. cold offline
  reopening is explicitly Chromium-only evidence, not a WebKit or physical-iPhone claim.
- ten paired layout/focus/status snapshots match across Chromium and WebKit at landscape
  phone sizes and portrait rotation. ordinary run/jump, pause/resume and Home journeys
  collect the same first seed with no errors or overflow. the same requested art bytes are
  unchanged. animated frames were not phase-locked, so this is not a pixel-perfect claim.
- `tools/oracle/` retains the independent pre-port recorder, exact platform reference hashes and 37
  deliberate mutation probes. the aggregate check runs comparison and mutation detection,
  not just the migrated tests. four named PWA parser/URL deltas are explicit and cannot
  exempt gameplay, content, saves or audio.

independent review, hosted verification, milestone tag and live installed-update receipt
remain release gates. this integration is not yet deployed.
