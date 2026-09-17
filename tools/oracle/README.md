# oracle

Compares a Jumpit tree against the reference release `25abd61230184517c85a7b5f381ad25988c81989`,
leaf by leaf. It exists for the typed Svelte and Vite migration (#24): the port has to play exactly
like the release it replaces.

## why

The behavioural suite asserts properties: a trail finishes, a shelf is cleared, a save migrates. The
replay check compares a recording with its own replay, which stays true when tuning changes both
sides together. None of it pins a trajectory, a tuning constant or an exact save shape, so a port
could finish every trail on a different path and stay green.

The oracle records exact values instead, 61,528 leaves:

- constants: body tuning, tile size, regions, campaign order, save version and key, daily challenges
- content: sha256 of every authored level
- trajectories: each tree generates its input sequence for every level, normal and hidden-light runs,
  then replays it through `createSimulation` and `stepSimulation` with a full-state hash every frame.
  The comparison checks both the input sequences and their outcomes against the pinned reference,
  so changing the port's generated inputs is itself a failure, not a way around a changed trajectory.
- physics boundaries: coyote and jump buffer windows, one-way shelf edges and tolerance, friction stop,
  substep accumulation, stomp and side contact
- fall reset, all 41 authored enemies, save migration and the save store, seeds, dailies, release
  selection, exact validator messages, music PCM and the cue call stream
- installed-app identity: manifest, title, theme color, icon links, worker cache name

## commands

```sh
npm run build                     # emit the current page and worker first
node tools/oracle/run.mjs          # compare this tree with the reference
node tools/oracle/mutants.mjs      # prove the oracle detects change
node tools/oracle/equivalence.mjs  # reproduce the equivalent-mutant evidence
```

All three build a temporary git worktree of the reference, so they need that commit locally. In
Actions use `actions/checkout` with `fetch-depth: 0`. Every run first checks the reference recording
against a platform-specific pinned hash, so a change in the recorder or the runtime fails loudly
instead of being read as a port difference. Unknown platforms fail with their measured hash.

The original release produces `31548e20…` on macOS ARM64 (Node 22.23.2 and 26.8.2), but
`e4d76725…` on Linux x64 (Node 22.23.2, pinned in CI). The 697-frame market-1 diagnostic found
one state difference: at frame 179, moth-a's y is `407a4320f6a5ab2d` versus `407a4320f6a5ab2e`
in IEEE-754 bits. Sine differs by one ulp at 11 sampled moth arguments, only one of which survives
the position arithmetic. Player state and event types match every frame. This is a difference in
the original release, not a port change. [JavaScript permits implementation-approximated sine](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sin).
The compiler-level cause is not established. `fingerprint.mjs` and `market1-diag.mjs` retain the
diagnostics, and `reference.mjs` names the original-tree runs that measured each full hash.

No coordinates are rounded, no trajectory is omitted, and no gameplay delta is allowed. The
current and original trees still record on the same runtime and compare every recorded leaf
exactly. Tests reject crossed pins, changed hashes and unknown platform keys.

## rules

- A migrated tree is compared by editing `paths.json` only, to point at where modules moved. No probe
  in `record.mjs` and no recorded value may change to fit a port.
- A difference passes only when `expected-deltas.json` names the exact leaf with a reason. Only
  installed-app identity (`pwa.*`) may be named. Any other leaf is refused, so gameplay, content, save
  and audio cannot be relaxed by editing that file.
- A named delta that no longer differs fails the run, so the list cannot go stale.
- A named delta must be a scalar leaf in both recordings, not a container. Replacing an
  entire manifest with null cannot be disguised as one accepted identity difference.

## mutation results

`mutants.mjs` applies 37 deliberate changes to copies of the reference release and requires each one to
change at least one leaf. Every anchor must match exactly once, or the mutant is refused and the run
fails, so a replacement that matched nothing can never count as detected. All 37 are detected.
An incomplete or failed recording fails the runner rather than increasing its detection score.
Executable fixture tests pin real differences, no-ops, missing/ambiguous anchors and recorder
exceptions, nonzero exits and signals. Array/object shape changes also count as differences.

They cover tuning (gravity, jump speed, coyote, buffer, landing grace), both collision substep
divisors, friction stop, the stomp window, run pose, one-way tolerance at both of its sites, slick and
belt surfaces, lift amplitude, spark duration, invulnerability, warden and spring bounces, fans,
crumble timing, mothlight motion, patrol turns, fall reset, checkpoint respawn, save migration and
reset rules, the daily win limit, the seed generator, daily seed and pick, release fallback, music
timing, cue envelopes, a validator message and the theme color.

One mutant is equivalent and is not scored: changing only the first bound of the one-way tolerance.
The second guard, `previousBottom > rect.y + 1`, masks it. `equivalence.mjs` shows 0 differing steps
in 400,000 randomized trials, half of them placed on the tolerance band. Changing both sites is scored
and detected.

## not covered

Canvas rendering, the DOM, control wiring, pause and background handling, install and update flows,
and upgrades from earlier installed workers. Those stay with the browser suite in `tests/e2e` and the
worker fixtures, which the port must also keep green.

The recording format is JSON, not a lossless serialization of every JavaScript value. The
reference contains no negative zero or non-finite numbers. Both the state-hash serializer and
final recording serializer refuse those values rather than silently folding them into zero or
null. The comparison pins recorded values and hashes, not arbitrary unobserved execution.
