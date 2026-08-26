import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVELS } from '../levels.js'
import { createRelease } from '../release.js'

test('the v1.2 release cannot unlock or continue into hidden trails', () => {
  const release = createRelease(LEVELS, 16)
  assert.equal(release.next('market-3'), 'market-4')
  assert.equal(release.next('market-4'), null)
  assert.equal(release.find('keep-1'), null)
  assert.equal(
    release.playable('keep-1', ['garden-1', 'market-4', 'keep-1']),
    'market-4',
  )
})
