# Jumpit v1.7 release receipt

Released 2026-08-26 from the verified `v1.5.0` complete-campaign build.

## Player surface

- Live play and release verification now use the same fixed-step transition. Terrain,
  lifts, crumble paths, collectibles, checkpoints, enemies, springs, fans, switches,
  bridges, lamps, gates, Sentries, the Warden, and the guarded bell have one owner.
- Every authored trail records and replays an exact deterministic input stream through
  that transition. The replays reach every progressive mechanic and complete all
  twenty real finish bells.
- A backgrounded, hidden, or blurred game pauses once, releases held and buffered input,
  suspends sound, and waits for an explicit gesture before resuming.
- Pointer, keyboard, and assistive-technology actions fire once. Native pause and resume
  activation cannot leak a jump, while Arrow and WASD movement still work with the pause
  control focused.
- The seven gameplay-canvas image elements keep empty sources until the first play
  gesture; the menu retains its normal CSS hero background. Two-times text, phone safe
  areas, reduced motion, and the five-second first reward remain playable.

## Installed shell

- Beginning with an active v1.7 worker, the complete 28-file shell precaches atomically
  into a new cache. Online navigation never mutates the active offline shell, so a missing
  required replacement file leaves the known-good v1.7 bytes intact.
- The shipped v1.5 worker and updater are preserved as byte-verified fixtures. The exact
  v1.5-to-v1.7 browser migration reaches one coherent v1.7 navigation, removes only the
  old Jumpit cache, and reloads offline on Chromium.
- The successful v1.5-to-v1.7 path is proven, but the already-shipped v1.5 worker cannot
  be retrofitted: an incomplete v1.7 deployment could still mutate its old navigation
  cache before installation fails. The release workflow must publish one complete build
  artifact; failed-update immutability is guaranteed from v1.7 forward.
- A worker-level offline oracle forces network rejection and proves both navigation
  fallback and direct cached-asset delivery. WebKit also proves the complete cache and
  coherent online migration; physical-iPhone offline verification remains a v2 device gate.
- The manifest has a stable identity and a separate maskable icon. Native, iOS,
  unavailable, cancelled, and already-installed states never expose a dead install action.

## Verification

- Logic, runtime, replay, PWA, install, update, worker, asset, copy, save, audio, and
  migration contracts: 72/72.
- Source phone suite: 44/44 across Chromium at 420x912 and WebKit at 390x844.
- Rebuilt production phone suite: 44/44 on the same matrix.
- Focused campaign-ending stress: 20/20, ten consecutive clears per browser engine.
- Canonical house PWA checker against the exact 28-file build: 26/26.
- Theme-token lint and pending public-diff architecture lint: clean.
- In-app browser inspection at 420x912 and 390x844: home, live play, touch controls,
  and the focused pause dialog have no page scroll or horizontal clipping.
- Deterministic shared-runtime replay runner: all 20 authored trails pass with unique,
  reproducible hashes; Garden Walk 4 and Beacon Keep 3 both emit a real crumble event.
- Exact shipped fixture blobs: v1.5 worker `6aeef5886fd93e86fce0df9e5f736284d6136e66`;
  v1.5 updater `640c09cff6ced479dce12f70daa4147f1d97cd2d`.
