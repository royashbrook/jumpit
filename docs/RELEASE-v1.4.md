# Jumpit v1.4 release receipt

Released 2026-08-26 from the verified `v1.2.0` Lantern Market build.

## Player surface

- One of four authored challenges is selected deterministically from today's
  seed. A shared seed link opens the same challenge for a friend.
- Challenge play can preview its released trail without selecting, completing,
  or unlocking campaign progress.
- A stamp requires both the authored seed goal and the finish bell. The latest
  fourteen stamps persist locally without accounts or a server.
- Rain is earned by clearing Rooftop Rain. Lantern is earned by clearing
  Lantern Market. Garden and Dusk remain available from the start.
- Existing v1 saves migrate in place while preserving cleared trails, unlocks,
  best seed counts, the selected trail, look, and sound preference.

## Verification

- Logic, campaign, artifact, copy, asset, migration, and challenge contracts:
  42/42.
- Source phone suite: 26/26 across Chromium at 420x912 and WebKit at 390x844.
- Rebuilt production phone suite: 26/26 on the same matrix.
- Canonical house PWA checker against the exact 27-file build: 26/26.
- Theme-token lint, tracked public-copy lint, and changed-surface architecture
  lint: clean.
- Deterministic real-physics geometry runner: all 20 authored trails pass.
- Manual browser inspection at both target phone sizes: daily card, locked
  reward copy, four-look grid, challenge launch, HUD, world, and controls are
  readable without horizontal clipping.
