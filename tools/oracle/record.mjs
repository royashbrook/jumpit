// Records exact values from a Jumpit tree so a port can be compared leaf by leaf.
//
// The behavioural suite asserts properties (a trail finishes, a shelf is cleared) and checks that a
// replay matches its own recording. Neither pins a trajectory or a tuning constant, so a port could
// finish every trail on different paths and stay green. This pins the reference tree's input
// sequences and replays them with a full-state per-frame hash, plus physics boundaries, enemies,
// saves, seeds, validator messages, audio synthesis and installed-app identity.
//
// Usage: node record.mjs <root> <out.json> [paths.json]
// paths.json maps logical module names to files under <root>. A migrated tree is compared by
// changing paths only. No probe and no recorded value may be changed to fit a port.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { recordedJSON } from './json.mjs'

const [root, outFile, pathsFile] = process.argv.slice(2)
if (!root || !outFile) { console.error('usage: record.mjs <root> <out.json> [paths.json]'); process.exit(2) }
const PATHS = {
  physics: 'engine/physics.js?v=2', simulation: 'engine/simulation.js?v=3', solvability: 'engine/solvability.js',
  levels: 'levels.js?v=2', save: 'save.js?v=4', seed: 'seed.js', daily: 'daily.js', release: 'release.js',
  audio: 'audio.js?v=2', manifest: 'manifest.json', index: 'index.html', worker: 'sw.js',
  stateFixture: 'tests/fixtures/v2.0-preview/state.json',
  ...(pathsFile ? JSON.parse(readFileSync(pathsFile, 'utf8')) : {}),
}
const url = key => { const [file, query] = PATHS[key].split('?'); return pathToFileURL(resolve(root, file)).href + (query ? `?${query}` : '') }
const text = key => readFileSync(resolve(root, PATHS[key].split('?')[0]), 'utf8')

const physics = await import(url('physics'))
const sim = await import(url('simulation'))
const solv = await import(url('solvability'))
const L = await import(url('levels'))
const save = await import(url('save'))
const seed = await import(url('seed'))
const daily = await import(url('daily'))
const rel = await import(url('release'))
const audio = await import(url('audio'))

const sha = s => createHash('sha256').update(s).digest('hex')
// canonical: sorted keys, functions dropped, the level back-reference dropped (content is pinned
// separately), exact float repr via JSON. No rounding: a changed epsilon must show.
function canon(value, seen = new WeakSet()) {
  if (typeof value === 'function' || value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[cycle]'
  seen.add(value)
  if (ArrayBuffer.isView(value)) return Array.from(value)
  if (Array.isArray(value)) return value.map(v => canon(v, seen) ?? null)
  const out = {}
  for (const k of Object.keys(value).sort()) {
    if (k === 'level') continue
    const v = canon(value[k], seen)
    if (v !== undefined) out[k] = v
  }
  return out
}
const J = v => recordedJSON(canon(v))
const clone = v => JSON.parse(JSON.stringify(v))
const catchMsg = fn => { try { return { ok: canon(fn()) } } catch (e) { return { threw: String(e.message) } } }
const rle = a => { const o = []; for (const v of a) { const l = o[o.length - 1]; if (l && l[0] === v) l[1]++; else o.push([v, 1]) } return o }
const decode = v => ({ left: Boolean(v & 1), right: Boolean(v & 2), jumpPressed: Boolean(v & 4) })

const out = { meta: { root, paths: PATHS, recordedAt: new Date().toISOString(), node: process.version } }

// A. constants
out.constants = {
  bodyDefaults: canon(physics.createBody().config), bodyShape: Object.keys(physics.createBody()).sort(),
  TILE: L.TILE, REGIONS: canon(L.REGIONS), CAMPAIGN_ORDER: [...L.CAMPAIGN_ORDER],
  SAVE_VERSION: save.SAVE_VERSION, SAVE_KEY: save.SAVE_KEY, DAILY_WIN_LIMIT: save.DAILY_WIN_LIMIT,
  DAILY_CHALLENGES: canon(daily.DAILY_CHALLENGES),
}

// B. authored content, per level, so a drift names the level
out.content = { order: L.LEVELS.map(l => l.id), perLevel: Object.fromEntries(L.LEVELS.map(l => [l.id, sha(J(l))])) }

// C. trajectories: each tree's recorder supplies inputs for this independent public-API replay.
// The comparison pins both those inputs and the resulting full-state per-frame hash chain against
// the reference recording. Generating different inputs therefore fails even if the trail finishes.
function trajectory(level, inputs) {
  const s = sim.createSimulation(level)
  let chain = sha('jumpit-oracle')
  const checkpoints = {}, samples = {}, events = {}
  let n = 0
  for (const v of inputs) {
    const ev = sim.stepSimulation(s, decode(v))
    for (const e of ev) events[e.type] = (events[e.type] || 0) + 1
    chain = sha(chain + J({ s: { world: s.world, player: s.player, frame: s.frame, finished: s.finished, moved: s.moved, jumped: s.jumped, respawns: s.respawns }, ev }))
    n++
    if (n % 100 === 0) checkpoints[n] = chain.slice(0, 16)
    if (n % 600 === 0 || n === 1) samples[n] = canon(s.player)
    if (s.finished) break
  }
  return { frames: s.frame, finished: s.finished, respawns: s.respawns, chain, checkpoints, samples,
    finalPlayer: canon(s.player), events, finalWorldHash: sha(J(s.world)) }
}
out.trajectories = {}
for (const level of L.LEVELS) {
  const normal = solv.recordReplay(level)
  const hidden = solv.recordHiddenLightReplay(level)
  out.trajectories[level.id] = {
    inputs: rle(normal.inputs), inputCount: normal.inputs.length, recordedHash: normal.hash ?? null,
    replay: trajectory(level, normal.inputs),
    hiddenInputs: rle(hidden.inputs), hiddenReplay: trajectory(level, hidden.inputs),
  }
}

// D. physics probes on a synthetic flat floor with a one-way shelf and a wall
const floor = [
  { id: 'floor', type: 'solid', x: -2000, y: 400, w: 6000, h: 64, active: true },
  { id: 'shelf', type: 'oneway', x: 300, y: 330, w: 96, h: 32, active: true },
  { id: 'wall', type: 'solid', x: 900, y: 200, w: 32, h: 200, active: true },
]
function run(body, script, frames) {
  const trace = []
  for (let f = 0; f < frames; f++) { physics.stepPhysics(body, script(f), floor); trace.push([body.x, body.y, body.vx, body.vy, body.onGround, body.pose, body.coyote, body.jumpBuffer, body.justJumped]) }
  return trace
}
const grounded = () => { const b = physics.createBody({ x: 0, y: 358 }); physics.stepPhysics(b, {}, floor); return b }
out.physics = {
  standJump: run(grounded(), f => ({ jumpPressed: f === 0 }), 70),
  runRight: run(grounded(), () => ({ right: true }), 90),
  runThenReverse: run(grounded(), f => (f < 30 ? { right: true } : { left: true }), 60),
  runJumpShelf: run(grounded(), f => ({ right: true, jumpPressed: f === 20 }), 90),
  runIntoWall: run(Object.assign(grounded(), { x: 700 }), () => ({ right: true }), 90),
  // coyote: a high ledge over a far floor, so no landing can contaminate the window. The press is
  // scheduled k frames after the FIRST airborne frame, k dense across the whole window.
  coyote: Object.fromEntries(Array.from({ length: 11 }, (_, k) => {
    const ledge = [{ id: 'ledge', type: 'solid', x: 0, y: 400, w: 200, h: 32, active: true }, { id: 'deep', type: 'solid', x: -4000, y: 4000, w: 9000, h: 64, active: true }]
    const b = physics.createBody({ x: 150, y: 358 }); physics.stepPhysics(b, {}, ledge)
    let airborneAt = -1
    const t = []
    for (let f = 0; f < 40; f++) {
      const press = airborneAt >= 0 && f === airborneAt + k
      physics.stepPhysics(b, { right: true, jumpPressed: press }, ledge)
      if (airborneAt < 0 && !b.onGround) airborneAt = f + 1
      t.push([b.x, b.y, b.vy, b.onGround, b.coyote, b.justJumped])
    }
    return [k, t]
  })),
  // buffer: press k frames before the step that lands, k dense 0..12 so the exact edge is sampled
  buffer: Object.fromEntries(Array.from({ length: 13 }, (_, k) => {
    const b = physics.createBody({ x: 0, y: 150 })
    const t = []
    let pressed = false
    for (let f = 0; f < 90; f++) {
      const press = !pressed && framesToLand(b) === k
      if (press) pressed = true
      physics.stepPhysics(b, { jumpPressed: press }, floor)
      t.push([b.y, b.vy, b.onGround, b.jumpBuffer, b.justJumped])
    }
    return [k, t]
  })),
  // one-way edge catch: drop straight down (no direction) across the shelf's left and right edges,
  // straddling landingGrace. Records the landing x/y per start x.
  shelfEdge: Array.from({ length: 81 }, (_, i) => {
    const x = 300 - 40 + i * (96 + 80) / 80
    const b = physics.createBody({ x, y: 250 })
    let landedY = null, landedX = null
    for (let f = 0; f < 30; f++) { physics.stepPhysics(b, {}, floor); if (b.onGround) { landedY = b.y; landedX = b.x; break } }
    return [x, landedX, landedY]
  }),
  stomp: [], side: [],
}
function framesToLand(body) {
  const b = clone(body); b.config = body.config
  for (let i = 0; i < 40; i++) { physics.stepPhysics(b, {}, floor); if (b.onGround) return i }
  return -1
}
const target = { x: 100, y: 300, w: 32, h: 32 }
for (let dy = -60; dy <= 12; dy += 1) for (const vy of [-4, 0, 1, 3, 6, 8, 9, 10, 12]) for (const dx of [-30, -28, 0, 20, 31, 32]) {
  const p = physics.createBody({ x: target.x + dx, y: target.y + dy }); p.vy = vy
  out.physics.stomp.push([dx, dy, vy, physics.isStomp(p, target)])
  out.physics.side.push([dx, dy, vy, physics.isSideDamage(p, target)])
}

// D2. boundaries the default-speed game rarely crosses, pinned through the public API
// speeds chosen where ceil(v/8) and ceil(v/9) DIFFER, on an unobstructed run: two half-steps and one
// full step do not sum to the same float, so the substep divisor shows in the last bit of x.
out.physics.substep = [8.5, 17, 26, 35].map(speed => {
  const thin = [{ id: 'thin', type: 'solid', x: 4000, y: 0, w: 6, h: 800, active: true }, { id: 'ground', type: 'solid', x: -4000, y: 400, w: 9000, h: 64, active: true }]
  const b = physics.createBody({ x: 150, y: 358, maxRun: speed, runAcceleration: speed })
  const t = []
  for (let f = 0; f < 30; f++) { physics.stepPhysics(b, { right: true }, thin); t.push([b.x, b.vx]) }
  return [speed, t]
})
out.physics.frictionStop = []
for (let v0 = 0.08; v0 <= 0.6; v0 += 0.0005) {
  const b = physics.createBody({ x: 0, y: 358 }); physics.stepPhysics(b, {}, floor); b.vx = v0
  let n = 0
  while (b.vx !== 0 && n < 60) { physics.stepPhysics(b, {}, floor); n++ }
  out.physics.frictionStop.push([Number(v0.toFixed(4)), n, b.x])
}
out.physics.onewayStart = []
for (let d = -3; d <= 4; d += 0.25) {
  // body bottom starts d px below the shelf top (shelf y 330), falling slowly, no direction
  const b = physics.createBody({ x: 320, y: 330 - 42 + d }); b.vy = 0.5
  physics.stepPhysics(b, {}, floor)
  out.physics.onewayStart.push([d, b.y, b.vy, b.onGround])
}
out.fallReset = []
{
  const level = L.LEVELS[0]
  for (let off = 0; off <= 13; off += 0.1) {
    const s = sim.createSimulation(level)
    s.player.x = -5000; s.player.y = s.world.height + 96 - off; s.player.vy = 0
    let frame = -1, y = null
    for (let f = 0; f < 10; f++) { const ev = sim.stepSimulation(s, {}); if (ev.some(e => e.type === 'fall')) { frame = f; break } y = s.player.y }
    out.fallReset.push([Number(off.toFixed(1)), frame, y])
  }
}

// E. enemies and simulation rules, per authored enemy
out.enemies = {}
for (const level of L.LEVELS) {
  const world = sim.createWorld(level)
  for (const e0 of world.enemies) {
    const e = clone(e0), trace = []
    for (let f = 0; f < 400; f++) { sim.advanceEnemy(e, f); if (f % 20 === 0) trace.push([e.x, e.y, e.vx]) }
    const s = clone(e0), strikes = []
    for (let i = 0; i < 8; i++) { strikes.push([canon(sim.strikeEnemy(s)), s.health, s.alive, s.invulnerable, s.squash]); for (let f = 0; f < 23; f++) sim.advanceEnemy(s, f) }
    out.enemies[`${level.id}/${e0.id}`] = { initial: canon(e0), trace, strikes }
  }
  out.enemies[`${level.id}#guardian`] = canon(sim.guardianState(world))
  out.enemies[`${level.id}#world`] = sha(J(world))
}

// F. saves
const storage = (initial, { throwGet = false, throwSet = false } = {}) => {
  const m = new Map(initial === undefined ? [] : [[save.SAVE_KEY, initial]]); const writes = []
  return { writes, getItem: k => { if (throwGet) throw new Error('blocked'); return m.has(k) ? m.get(k) : null }, setItem: (k, v) => { if (throwSet) throw new Error('full'); writes.push([k, v]); m.set(k, v) } }
}
const fixture = existsSync(resolve(root, PATHS.stateFixture)) ? JSON.parse(text('stateFixture')) : null
const migrateInputs = {
  null: null, array: [], number: 7, empty: {}, fixture,
  legacy: { completed: ['garden-1', 'garden-1', 3, 'garden-2'], unlocked: ['garden-2', 'nope'], bestSeeds: { 'garden-1': 99, 'garden-2': -1, bogus: 3, 'garden-3': 2.5 }, selectedLevel: 'garden-2', theme: 'dusk', muted: 'yes', dailyWins: [1, 1, -2, 0, 3.5, ...Array.from({ length: 20 }, (_, i) => 20260900 + i)], hiddenLights: ['nope'], controlsLearned: 'true' },
  lockedSelect: { unlocked: [], selectedLevel: 'garden-9', theme: 'neon' },
}
out.save = {
  fresh: canon(save.freshSave()),
  migrate: Object.fromEntries(Object.entries(migrateInputs).map(([k, v]) => [k, catchMsg(() => save.migrateSave(v))])),
  load: {
    missing: canon(save.loadSave(storage(undefined))), garbage: canon(save.loadSave(storage('{not json'))),
    throws: canon(save.loadSave(storage(undefined, { throwGet: true }))), nullStorage: canon(save.loadSave(null)),
  },
  goldBell: L.LEVELS.map(l => [l.id, save.hasGoldBell({ completed: [l.id], bestSeeds: { [l.id]: l.objects.filter(([, k]) => k === 'seed').length } }, l.id)]),
}
{
  const st = storage(undefined), changes = []
  const store = save.createSaveStore({ storage: st, onChange: s => changes.push(s) })
  const ops = [
    ['selectLevel', 'garden-2'], ['completeLevel', 'garden-1', 99, 'garden-2'], ['completeLevel', 'garden-1', 1.9, 'garden-2'],
    ['completeLevel', 'garden-2', NaN, null], ['selectLevel', 'garden-2'], ['setTheme', 'rain'], ['setTheme', 'neon'],
    ['completeDaily', 20260917], ['completeDaily', 20260917], ['completeDaily', -1], ['findHiddenLight', 'nope'],
    ['learnControls'], ['learnControls'], ['setMuted', 'x'], ['reset'], ['requestReset'], ['resetArmed'], ['disarmReset'], ['reset'], ['requestReset'], ['reset'],
  ]
  for (let i = 0; i < 20; i++) ops.push(['completeDaily', 20261000 + i])
  const log = ops.map(([op, ...args]) => [op, args.map(a => Number.isNaN(a) ? 'NaN' : a), canon(store[op](...args)), canon(store.get())])
  out.save.store = { log, writes: st.writes.length, lastWrite: st.writes.at(-1), changes: changes.length }
  const blocked = save.createSaveStore({ storage: storage(undefined, { throwSet: true }) })
  out.save.blockedWrite = [canon(blocked.completeLevel('garden-1', 2, 'garden-2')), canon(blocked.get())]
}

// G. seeds, dailies, release
out.seed = {
  rng: Object.fromEntries([0, 1, 42, 20260917, 4294967295, -1].map(s => { const r = seed.rng(s); return [s, Array.from({ length: 16 }, r)] })),
  dailySeed: ['2026-01-01T12:00', '2026-09-17T00:00', '2026-09-17T23:59', '2024-02-29T12:00', '1999-12-31T12:00'].map(d => [d, seed.dailySeed(new Date(d))]),
  shuffle: Object.fromEntries([1, 7, 20260917].map(s => [s, seed.shuffle(seed.rng(s), L.CAMPAIGN_ORDER)])),
  daily: Array.from({ length: 60 }, (_, i) => [20260900 + i, daily.dailyChallenge(20260900 + i).id]).concat([['', daily.dailyChallenge('').id], ['abc', daily.dailyChallenge('abc').id], [0, daily.dailyChallenge(0).id]]),
  won: daily.DAILY_CHALLENGES.flatMap(c => [[c.id, 0, true], [c.id, c.goalSeeds - 1, true], [c.id, c.goalSeeds, true], [c.id, 99, false]].map(([id, seeds, finished]) => [id, seeds, finished, daily.challengeWon(c, { seeds, finished })])),
}
out.release = Object.fromEntries([0, 1, 4, 12, 20, 25].map(n => {
  const r = rel.createRelease(L.LEVELS, n)
  const ids = [...L.CAMPAIGN_ORDER, 'nope', null]
  return [n, { ids: r.levels.map(l => l.id), next: ids.map(id => [id, r.next(id)]), find: ids.map(id => [id, r.find(id)?.id ?? null]),
    playable: [[L.CAMPAIGN_ORDER[3], ['garden-1']], [L.CAMPAIGN_ORDER[3], L.CAMPAIGN_ORDER.slice(0, 5)], ['nope', []], [L.CAMPAIGN_ORDER[19], L.CAMPAIGN_ORDER]].map(([p, u]) => [p, r.playable(p, u)]) }]
}))

// H. campaign validator, exact messages
const bad = []
const mut = (name, fn) => { const c = clone(L.LEVELS); fn(c); bad.push([name, catchMsg(() => L.validateCampaign(c))]) }
bad.push(['shipped', catchMsg(() => L.validateCampaign(L.LEVELS))], ['notArray', catchMsg(() => L.validateCampaign({}))])
mut('dropLast', c => c.pop()); mut('swap01', c => { [c[0], c[1]] = [c[1], c[0]] }); mut('dupId', c => { c[1].id = c[0].id })
for (const f of ['id', 'order', 'region', 'name', 'size', 'spawn', 'finish', 'terrain', 'objects']) mut(`missing:${f}`, c => { delete c[5][f] })
mut('spawnOut', c => { c[2].spawn = [9999, 0] }); mut('sizeZero', c => { c[2].size = [0, 10] }); mut('notObject', c => { c[3] = 'x' })
mut('noHiddenLight', c => { c[0].objects = c[0].objects.filter(([, k]) => k !== 'hidden-light') })
mut('terrainOut', c => { c[4].terrain[0][2] = -50 })
out.validator = bad

// I. audio
function fakeContext(rate) {
  return { sampleRate: rate, createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { length: len, sampleRate: sr, getChannelData: () => d } } }
}
out.audio = { music: [44100, 48000].map(rate => { const b = audio.createMusicBuffer(fakeContext(rate)); const d = b.getChannelData(0); return [rate, b.length, sha(Buffer.from(d.buffer)), Array.from(d.slice(1000, 1008))] }) }
{
  const calls = []
  const param = name => ({ set value(v) { calls.push([name, 'value', v]) }, setValueAtTime: (v, t) => calls.push([name, 'set', v, t]), exponentialRampToValueAtTime: (v, t) => calls.push([name, 'exp', v, t]) })
  const ctx = {
    state: 'suspended', currentTime: 10, sampleRate: 44100, destination: {},
    resume() { this.state = 'running'; return Promise.resolve() }, suspend() { this.state = 'suspended'; return Promise.resolve() }, close: () => Promise.resolve(),
    createGain: () => ({ gain: param('gain'), connect() {} }),
    createOscillator: () => { const o = { frequency: param('freq'), connect() {}, start: t => calls.push(['osc', 'start', t]), stop: t => calls.push(['osc', 'stop', t]) }; Object.defineProperty(o, 'type', { set: v => calls.push(['osc', 'type', v]) }); return o },
    createBuffer: fakeContext(44100).createBuffer, createBufferSource: () => ({ connect() {}, start() {}, stop() {} }),
  }
  const a = audio.createAudio({ contextFactory: () => ctx })
  const beforeGesture = a.cue('jump')
  const started = await a.startFromGesture()
  const cues = {}
  for (const name of ['tap', 'start', 'jump', 'seed', 'hidden-light', 'stomp', 'power', 'checkpoint', 'guardian-hit', 'guardian-defeated', 'guardian-locked', 'hurt', 'pause', 'finish', 'unknown-cue']) {
    calls.length = 0; const ok = a.cue(name); cues[name] = [ok, sha(JSON.stringify(calls)), calls.length]
  }
  a.setMuted(true); const mutedCue = a.cue('jump'); a.setMuted(false)
  out.audio.cues = { beforeGesture, started, cues, mutedCue }
}

// J. PWA identity: the semantic identity a player's installed app depends on, not file bytes
const idx = text('index')
const sw = text('worker')
out.pwa = {
  manifest: canon(JSON.parse(text('manifest'))),
  index: { title: idx.match(/<title>([^<]*)</)?.[1] ?? null, themeColor: idx.match(/name="theme-color" content="([^"]*)"/)?.[1] ?? null,
    manifestHref: idx.match(/rel="manifest" href="([^"]*)"/)?.[1] ?? null, touchIcon: idx.match(/rel="apple-touch-icon" href="([^"]*)"/)?.[1] ?? null },
  cacheName: sw.match(/const CACHE = '([^']*)'/)?.[1] ?? null,
  cachePrefix: (sw.match(/const CACHE = '([^']*)'/)?.[1] ?? '').replace(/v[\d.]+.*$/, ''),
}

writeFileSync(outFile, recordedJSON(out))
const leaves = v => v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + leaves(x), 0) : 1
console.log(`recorded ${outFile}: ${leaves(out)} leaves, ${L.LEVELS.length} levels, ${Object.values(out.trajectories).filter(t => t.replay.finished).length} normal replays finished, ${Object.values(out.trajectories).filter(t => t.hiddenReplay.finished).length} hidden replays finished`)
