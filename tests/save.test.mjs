import assert from 'node:assert/strict'
import test from 'node:test'
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
  return {
    getItem: key => key === SAVE_KEY ? value : null,
    setItem: (key, next) => { if (key === SAVE_KEY) value = next },
    read: () => value,
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

test('v1 saves migrate to v2 without losing progress or preferences', () => {
  const storage = memoryStorage(JSON.stringify({
    version: 1,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 4 },
    selectedLevel: 'garden-2',
    theme: 'dusk',
    muted: true,
  }))

  assert.deepEqual(loadSave(storage), {
    ...freshSave(),
    version: SAVE_VERSION,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 4 },
    selectedLevel: 'garden-2',
    theme: 'dusk',
    muted: true,
  })
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
