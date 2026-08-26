import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVELS } from '../levels.js'
import { createRelease } from '../release.js'

test('the v1.5 release opens the complete twenty-trail campaign', () => {
  const release = createRelease(LEVELS, 20)
  assert.equal(release.next('market-4'), 'keep-1')
  assert.equal(release.next('keep-3'), 'keep-4')
  assert.equal(release.next('keep-4'), null)
  assert.equal(release.find('keep-1')?.id, 'keep-1')
  assert.equal(release.playable('keep-4', ['garden-1', 'keep-4']), 'keep-4')
})
