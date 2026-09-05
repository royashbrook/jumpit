# Changelog

## Unreleased

- Gave the portrait rotate gate the game's identity (icon, name, tagline) and a clear
  state: at Home it says turn sideways to play, mid-trail it says the trail is paused and
  EXIT TO HOME visibly returns to the Home wording. Dropped the focus ring the gate title
  painted on first load.
- Made the README, roadmap, and changelog match the shipped build: the whole game is
  landscape only by design, and v2.0.0 is released.

## 2.0.0: 2026-08-27

- Stabilized the twenty-trail campaign across five grounded places with full progression,
  original art and sound, optional Hidden Lights, and a three-hit final guardian.
- Made play landscape-first with a clear portrait rotate gate, an edge-to-edge world,
  a wider direction-aware camera, a transient left-side stick, and right-side jumping.
- Kept the camera's look direction through a stop so releasing the stick no longer
  pulls the world backward, while reversals still ease across the trail.
- Extended every post-tutorial trail by two landscape camera widths with recovery
  ground, shelf routes, and rewards; the three-second opening lesson stays fast.
- Replaced the hidden stationary shelf boost with one 106-pixel tap jump and added
  six-pixel one-way ledge forgiveness for visually earned corner landings.
- Moved the Bramble Bank checkpoint off its collapsing bank and reject future
  checkpoints on terrain that disappears.
- Aligned the courier's shoes to every shelf, restored the finish bell to its authored
  lane, and made the guide point up or down when a nearby bell is on another tier.
- Added a short WHOOPS respawn beat that holds the miss, clears held input, and hides
  the checkpoint camera cut before returning control.
- Shortened the opening touch coach to two seconds and removed the persistent
  horizontal bell guide while keeping the wrong-level finish cue.
- Added an original looping woodland-adventure score that follows play, pause, mute,
  background suspension, and Home.
- Gave walkable terrain a brighter edge, deeper lip, and palette-aware face texture.
- Rebuilt natural terrain as outlined cartoon cliffs with scalloped turf, grass tufts,
  roots, and curved stonework instead of rectangular tiles.
- Cull terrain outside the camera so the richer foreground stays smooth on phones.
- Made every Lantern Seed grant a short gold combat Spark, with extra time for creature
  bumps, while the Glow Cloak remains the permanent in-trail power-up.
- Added persistent Gold Bells for perfect seed clears, visible on Home, trail cards, and
  the clear celebration without adding currency, grinding, or another control.
- Added a sticky in-app update toast so a ready release waits for the player's tap
  instead of reloading the game or requiring a close and reopen.
- Compacted release JavaScript during packaging to preserve the fixed download budget.
- Proved the exact shipped v1.9 installed client and same-version preview cache upgrade
  once into the coherent v2 shell,
  while a failed v2.1 precache leaves the active offline shell untouched.
- Shipped v2.0.0 through the protected permanent-origin and Pages workflows on 2026-08-27;
  the later 2.0.0 shell generations rolled out behind the in-app update toast. The physical
  iPhone and Android receipts and the 4-of-5 cold-kid gate stay open in issue #1.

## 1.9.0: 2026-08-26

- Added one optional, reachable Hidden Light to each place. Discoveries persist from
  campaign, daily, or friend runs, survive restart and reload, and never guard a bell.
- Kept Hidden Lights surprising: no empty checklist appears before the first discovery;
  later Home and Trails marks stay compact, and only the final ending reflects the set.
- Replaced the 15.8 MB canvas PNG payload with 2.1 MB of selectively loaded WebPs while
  retaining the source PNGs and a closed, hash-verified derivation manifest.
- Proved real WebP MIME, decode, dimensions, and sprite alpha in both phone engines,
  exact v1.8 installed-client migration, and AA token contrast across all four looks.

## 1.8.0: 2026-08-26

- Rebuilt the opening trail as a short, zero-fall run-jump-stomp lesson with its
  first seed and creature bounce inside the opening second of deterministic play.
- Moved the glow cloak to the second trail and made the sharpest tower checkpoint
  forgiving without removing its three-Sentry encounter.
- Reduced the fresh PLAY panel to one campaign action and collapsed unreached places
  into compact sleeping rows instead of sixteen locked chores.
- Added one-verb coaching, an always-visible bell direction, retriggered reward feedback,
  and clear screens that name the trail or place just opened.

## 1.7.0: 2026-08-26

- Made live play and deterministic verification use one fixed-step game transition.
- Added exact replay hashes and real finish receipts for all twenty trails.
- Made the v1.7 offline cache immutable while a complete replacement installs, and
  proved the successful migration from the exact shipped v1.5 worker and updater.
- Paused safely on app interruption, released held controls, and required an explicit
  gesture to resume sound and play.
- Deferred the seven gameplay-canvas image elements until play and strengthened
  keyboard, screen-reader, large-text, safe-area, and reduced-motion behavior.

## 1.5.0: 2026-08-26

- Opened four vertical Beacon Keep trails to complete the twenty-trail campaign.
- Added patrolling Sentries and a forgiving three-stomp Warden encounter.
- Locked the final bell until the Warden is defeated, with a checkpoint before the arena.
- Added a focused campaign ending with replay and home actions.

## 1.4.0: 2026-08-26

- Added four authored seed challenges selected deterministically each day.
- Made shared seed links open the same playable friend challenge.
- Added Rain and Lantern looks earned by clearing their campaign regions.
- Migrated existing saves without losing trail progress, best seeds, sound, or look.

## 1.2.0: 2026-08-26

- Opened four Lantern Market trails with Mothlights, lightable lamps, and shadow gates.
- Added original Market and Keep background art plus their full enemy/mechanic sheet.
- Kept Beacon Keep sealed until its guardian and ending are complete.

## 1.0.1: 2026-08-26

- Kept the twelve-trail release sealed after Workshop Loft is cleared.
- Made Switchback Rafters switches raise their paired bridges.
- Limited service-worker cleanup to old Jumpit caches on shared origins.

## 1.0.0: 2026-08-26

- First public Jumpit release: 12 mobile-first trails in three original regions.
- Added saved progression, two looks, original synthesized sound, offline/update
  support, install flow, bottom navigation, pause/restart, and adaptive kid coaching.
- Verified at the two target phone sizes in Chromium and WebKit.

## 0.0.0: 2026-08-26

- Established the original Jumpit identity and house PWA shell.
