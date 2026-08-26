import assert from 'node:assert/strict'
import test from 'node:test'
import { challengeWon, dailyChallenge, DAILY_CHALLENGES } from '../daily.js'
import { LEVELS } from '../levels.js'

test('a shared seed always selects the same authored released challenge', () => {
  const first = dailyChallenge(20260826)
  assert.deepEqual(dailyChallenge(20260826), first)
  assert.ok(DAILY_CHALLENGES.includes(first))
  const released = LEVELS.slice(0, 16)
  assert.ok(released.some(level => level.id === first.levelId))
  for (const challenge of DAILY_CHALLENGES) {
    const level = released.find(candidate => candidate.id === challenge.levelId)
    assert.ok(level, `${challenge.id} uses a released trail`)
    const seedCount = level.objects.filter(([, kind]) => kind === 'seed').length
    assert.ok(seedCount >= challenge.goalSeeds, `${challenge.id} seed goal is attainable`)
  }
})

test('a daily stamp needs both its seed goal and the finish bell', () => {
  const challenge = DAILY_CHALLENGES[0]
  assert.equal(challengeWon(challenge, { finished: false, seeds: 4 }), false)
  assert.equal(challengeWon(challenge, { finished: true, seeds: 2 }), false)
  assert.equal(challengeWon(challenge, { finished: true, seeds: 3 }), true)
})
