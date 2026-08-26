# Jumpit v1.5 release receipt

Released 2026-08-26 from the verified `v1.4.0` challenge build.

## Player surface

- All twenty authored trails are now visible across five grounded storybook places.
- Beacon Keep climbs through four distinct vertical fortress trails. Sentries build from
  one encounter to three before the finale.
- The Warden takes exactly three separated stomps. A lit checkpoint sits before the arena,
  and the final bell stays visibly locked until the Warden is down.
- The final clear opens a focused campaign ending with replay and home actions. Returning
  home preserves the completed campaign and changes the main play copy.
- Existing campaign, daily challenge, earned-look, sound, and save behavior remains intact.

## Verification

- Logic, campaign, artifact, copy, asset, migration, audio, and guardian contracts: 48/48.
- Source phone suite: 26/26 across Chromium at 420x912 and WebKit at 390x844.
- Rebuilt production phone suite: 26/26 on the same matrix.
- Canonical house PWA checker against the exact 27-file build: 26/26.
- Theme-token lint and pending public-diff architecture lint: clean.
- Deterministic real-physics geometry runner: all 20 authored trails pass. Beacon Keep
  finishes in 366, 431, 467, and 538 simulated frames.
- In-app browser inspection at 390x844 and 420x912: the twenty-trail selector, play world,
  pause dialog, touch controls, and bottom navigation remain readable without page scroll
  or horizontal clipping. The ending card is also bounded inside the stage at both target
  sizes by the source and rebuilt-production browser suites.
