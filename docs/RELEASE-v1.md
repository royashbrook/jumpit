# Jumpit v1 release receipt

Released 2026-08-26 from the verified `v0.9.0` candidate.

## Player surface

- 12 sequential trails across Garden Walk, Rooftop Rain, and Workshop Loft.
- Mobile-first touch run/jump, pause, instant restart, checkpoints, seeds, finish bells,
  Mosslings, Drizzlets, Gearlings, glow cloak, springs, crumble paths, slick roofs,
  fans, conveyors, lifts, and switches.
- Saved trail progress, Garden/Dusk looks, sound preference, friends link, install,
  update banner, offline shell, and the four-slot bottom menu.
- Original generated icon, courier animation, creature/mechanic sheets, and three
  grounded region scenes, all hash-tracked in `assets/manifest.json`.

## Verification

- Logic/contracts: 32/32.
- Phone browser suite: 20/20 across Chromium at 420x912 and WebKit at 390x844.
- House PWA checker: 26/26.
- Theme-token lint: clean. Copy lint: clean.
- Deterministic real-physics solvability: all 20 authored trails pass; the first 12
  are exposed in v1.
- Chromium performs a real offline reload. Playwright WebKit errors internally when
  its network is toggled, so the WebKit leg attests an active controller plus cached
  shell, game module, and generated art instead.

The release contains no production test-control hook and publishes only the exact
`build/` file allowlist. Both CI and the Pages release rebuild that artifact and require
its complete two-browser suite before it can ship.
