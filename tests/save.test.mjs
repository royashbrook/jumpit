import assert from 'node:assert/strict'
import test from 'node:test'
import { createSaveStore, freshSave, loadSave, SAVE_KEY } from '../save.js'

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
