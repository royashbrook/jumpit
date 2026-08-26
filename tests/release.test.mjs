import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVELS } from '../levels.js'
import { createRelease } from '../release.js'

test('the v1 release cannot unlock or continue into hidden trails', () => {
  const release = createRelease(LEVELS, 12)
  assert.equal(release.next('workshop-3'), 'workshop-4')
  assert.equal(release.next('workshop-4'), null)
  assert.equal(release.find('market-1'), null)
  assert.equal(
    release.playable('market-1', ['garden-1', 'workshop-4', 'market-1']),
    'workshop-4',
  )
})
