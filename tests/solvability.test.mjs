import assert from 'node:assert/strict'
import test from 'node:test'
import { proveFinishable } from '../engine/solvability.js'
import { LEVELS } from '../levels.js'

test('the deterministic real-physics runner can finish every authored trail', () => {
  const receipts = LEVELS.map(level => ({ id: level.id, ...proveFinishable(level) }))
  assert.deepEqual(receipts.filter(result => !result.finishable), [], JSON.stringify(receipts, null, 2))
  assert.ok(receipts.every(result => result.jumps > 0))
})
