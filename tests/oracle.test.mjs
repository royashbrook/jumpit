import test from 'node:test'
import assert from 'node:assert/strict'
import { diffRecordings } from '../tools/oracle/compare.mjs'
import { recordedJSON } from '../tools/oracle/json.mjs'

test('reference comparison rejects changed container types even when enumerable keys match', () => {
  for (const [before, after] of [[[], {}], [[1, 2], { 0: 1, 1: 2 }]]) {
    assert.deepEqual(diffRecordings({ save: { completed: before } }, { save: { completed: after } }), ['save.completed'])
    assert.deepEqual(diffRecordings({ save: { completed: after } }, { save: { completed: before } }), ['save.completed'])
  }
})

test('reference comparison checks added, removed and changed leaves while ignoring recorder metadata', () => {
  const before = { meta: { root: '/old' }, save: { completed: ['garden-1'], muted: true, removed: 3 } }
  const after = { meta: { root: '/new' }, save: { completed: ['garden-2'], muted: false, added: 4 } }
  assert.deepEqual(diffRecordings(before, after), ['save.completed.0', 'save.muted', 'save.removed', 'save.added'])
  assert.deepEqual(diffRecordings(before, structuredClone(before)), [])
})

test('recordings refuse numbers that JSON would silently collapse into null or zero', () => {
  for (const value of [NaN, Infinity, -Infinity, -0]) {
    assert.throws(() => recordedJSON({ save: { value } }), /unrepresentable number/)
    assert.throws(() => recordedJSON({ trace: [value] }), /unrepresentable number/)
  }
  const valid = { value: null, trace: [0, 0.1, -1, Number.MAX_VALUE] }
  assert.equal(recordedJSON(valid), JSON.stringify(valid))
})
