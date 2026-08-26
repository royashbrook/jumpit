# Jumpit v1.8 release receipt

Released 2026-08-26 from the verified `v1.7.0` runtime and installed-play build.

## First Light

- Garden Walk 1 is now a short run-jump-stomp lesson. Its deterministic replay reaches
  the first seed at frame 11, the first creature bounce at frame 40, and the bell at
  frame 193 with no fall or retry.
- The glow cloak begins on the second trail, after movement and jumping are understood.
  Beacon Keep 3 keeps its three-Sentry encounter while moving the checkpoint past its
  sharpest climb; its replay falls from 2,552 frames and nine retries to 544 and one.
- Fresh PLAY presents one campaign action. Daily and shared challenges live under MORE,
  and TRAILS expands only reached places while future places remain compact sleeping rows.
- Coaching asks for one verb at a time, then becomes a persistent bell direction. Seeds,
  stomps, checkpoints, and the finish bell get a short impact that becomes static under
  reduced motion; repeated status messages visibly retrigger.
- A clear names the trail or place it opened and focuses NEXT TRAIL when one exists.

## Save and installed-shell continuity

- Existing best-seed scores are filtered to released trails and clamped to each trail's
  current maximum. An exact v1.7 four-seed Garden Walk 1 save migrates to `3/3`; neither
  HOME nor TRAILS can render an impossible `4/3`.
- Reward particles, impact rings, and camera kick keep decaying behind the finish sheet,
  then reset on restart, next trail, or stop.
- The exact shipped v1.7 worker and updater are preserved as hash-verified fixtures. A
  controlled v1.7 client upgrades through its normal `controllerchange` path with exactly
  one navigation into the sole coherent v1.8 cache. Chromium reopens that shell offline;
  WebKit proves the same transition and cache while its forced-offline limitation remains
  explicit.

## Verification

- Logic, runtime, replay, PWA, install, update, worker, asset, copy, save, audio, and
  migration contracts: 77/77.
- Source phone suite: 54/54 across Chromium at 420x912 and WebKit at 390x844.
- Rebuilt production phone suite: 54/54 on the same matrix.
- Deterministic shared-runtime replay runner: all 20 authored trails pass; First Light
  completes in 193 frames with zero retries and Beacon Keep 3 in 544 with one.
- Canonical house PWA checker against the exact 28-file build: 26/26.
- Theme-token lint and pending public-diff architecture lint: clean.
- In-app browser inspection at 420x912 and 390x844: the one-action home, compact trail
  list, MORE challenge, live game, and focused pause sheet fit without page scroll or
  horizontal clipping.
- Exact shipped fixture blobs: v1.5 worker `6aeef5886fd93e86fce0df9e5f736284d6136e66`;
  v1.5 updater `640c09cff6ced479dce12f70daa4147f1d97cd2d`; v1.7 worker
  `cd89bbe2545e463e82269012fc0c6d5aefcabacc`; v1.7 updater
  `6b325b24741f7e9becef5cb138a0f50f55d256da`.
- Physical-iPhone offline/update verification and the cold-kid comprehension gate remain
  v2 human-device gates; this receipt does not claim them.
