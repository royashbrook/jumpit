import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVELS } from '../levels.js'
import {
  createSaveStore,
  DAILY_WIN_LIMIT,
  freshSave,
  loadSave,
  SAVE_KEY,
  SAVE_VERSION,
} from '../save.js'

function memoryStorage(initial = null) {
  let value = initial
  let writes = 0
  return {
    getItem: key => key === SAVE_KEY ? value : null,
    setItem: (key, next) => { if (key === SAVE_KEY) { value = next; writes += 1 } },
    read: () => value,
    writes: () => writes,
  }
}

test('completion saves the best seed count and unlocks the next trail', () => {
  const storage = memoryStorage()
  const store = createSaveStore({ storage })
  store.completeLevel('garden-1', 2, 'garden-2')
  store.completeLevel('garden-1', 1, 'garden-2')
  assert.deepEqual(store.get(), {
    ...freshSave(),
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 2 },
    selectedLevel: 'garden-2',
  })
  assert.equal(loadSave(storage).bestSeeds['garden-1'], 2)
})

test('locked trails cannot be selected and reset requires an armed second action', () => {
  const store = createSaveStore({ storage: memoryStorage() })
  assert.equal(store.selectLevel('keep-4'), false)
  assert.equal(store.reset(), false)
  store.requestReset()
  assert.equal(store.reset(), true)
  assert.deepEqual(store.get(), freshSave())
})

test('blocked or corrupt storage falls back without breaking play', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  const store = createSaveStore({ storage: blocked })
  assert.deepEqual(store.get(), freshSave())
  assert.doesNotThrow(() => store.completeLevel('garden-1', 4, 'garden-2'))
  assert.equal(store.get().selectedLevel, 'garden-2')
})

test('sound preference is part of the guarded save', () => {
  const storage = memoryStorage()
  const store = createSaveStore({ storage })
  assert.equal(store.setMuted(true), true)
  assert.equal(loadSave(storage).muted, true)
})

test('old saves migrate without losing progress or showing impossible seed totals', () => {
  const storage = memoryStorage(JSON.stringify({
    version: 1,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 9, 'missing-trail': 7 },
    selectedLevel: 'garden-2',
    theme: 'dusk',
    muted: true,
  }))

  assert.deepEqual(loadSave(storage), {
    ...freshSave(),
    version: SAVE_VERSION,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 3 },
    selectedLevel: 'garden-2',
    theme: 'dusk',
    muted: true,
  })
})

test('the exact v1.7 four-seed opening score migrates to the shorter First Light maximum', () => {
  const storage = memoryStorage(JSON.stringify({
    version: 2,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 4 },
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: false,
    dailyWins: [],
  }))
  const migrated = loadSave(storage)
  assert.equal(migrated.bestSeeds['garden-1'], 3)
  assert.ok(migrated.bestSeeds['garden-1'] <= LEVELS[0].objects.filter(([, kind]) => kind === 'seed').length)
})

test('longer trails preserve every previously perfect seed score', () => {
  const legacyTotals = {
    'garden-1': 3, 'garden-2': 4, 'garden-3': 4, 'garden-4': 4,
    'rooftop-1': 4, 'rooftop-2': 4, 'rooftop-3': 5, 'rooftop-4': 5,
    'workshop-1': 4, 'workshop-2': 4, 'workshop-3': 5, 'workshop-4': 5,
    'market-1': 4, 'market-2': 5, 'market-3': 5, 'market-4': 6,
    'keep-1': 6, 'keep-2': 6, 'keep-3': 7, 'keep-4': 6,
  }
  const ids = Object.keys(legacyTotals)
  const storage = memoryStorage(JSON.stringify({
    version: SAVE_VERSION,
    completed: ids,
    unlocked: ids,
    bestSeeds: legacyTotals,
    selectedLevel: 'keep-4',
  }))
  const loaded = loadSave(storage)

  for (const level of LEVELS) {
    const currentMaximum = level.objects.filter(([, kind]) => kind === 'seed').length
    assert.equal(currentMaximum, legacyTotals[level.id], `${level.id} changed its seed maximum`)
    assert.equal(loaded.bestSeeds[level.id], currentMaximum, `${level.id} lost its perfect score`)
  }
})

test('hidden lights persist immediately, reject false stamps, and reset with progress', () => {
  const ids = LEVELS.flatMap(level => level.objects.filter(([, kind]) => kind === 'hidden-light').map(([id]) => id))
  assert.equal(ids.length, 5)
  const storage = memoryStorage(JSON.stringify({ version: 2, hiddenLights: [ids[0], ids[0], 'made-up-light', 7] }))
  const store = createSaveStore({ storage })
  assert.deepEqual(store.get().hiddenLights, [ids[0]])
  assert.equal(store.findHiddenLight('made-up-light'), false)
  assert.equal(store.findHiddenLight(ids[0]), false)
  assert.equal(storage.writes(), 0)
  assert.equal(store.findHiddenLight(ids[1]), true)
  assert.equal(storage.writes(), 1)
  assert.deepEqual(loadSave(storage).hiddenLights, ids.slice(0, 2))

  store.requestReset()
  assert.equal(store.reset(), true)
  assert.deepEqual(store.get().hiddenLights, [])
})

test('all four released looks persist and unknown looks are rejected', () => {
  const storage = memoryStorage()
  const store = createSaveStore({ storage })

  for (const theme of ['garden', 'dusk', 'rain', 'lantern']) {
    assert.equal(store.setTheme(theme), true)
    assert.equal(loadSave(storage).theme, theme)
  }
  assert.equal(store.setTheme('void'), false)
  assert.equal(store.get().theme, 'lantern')
})

test('daily wins persist once each and retain only the latest small history', () => {
  const storage = memoryStorage()
  const store = createSaveStore({ storage })
  const seeds = Array.from({ length: DAILY_WIN_LIMIT + 3 }, (_, index) => 20260801 + index)

  assert.equal(store.completeDaily(0), false)
  for (const seed of seeds) assert.equal(store.completeDaily(seed), true)
  assert.equal(store.completeDaily(seeds.at(-1)), false)

  const expected = seeds.slice(-DAILY_WIN_LIMIT)
  assert.deepEqual(store.get().dailyWins, expected)
  assert.deepEqual(loadSave(storage).dailyWins, expected)
})
