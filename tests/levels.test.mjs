import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAMPAIGN_ORDER,
  LEVELS,
  REGIONS,
  TILE,
  assertCampaign,
  validateCampaign,
} from '../levels.js'

const copy = () => structuredClone(LEVELS)

test('the v2 campaign is twenty authored levels across five ordered places', () => {
  assert.equal(TILE, 32)
  assert.deepEqual(REGIONS.map(region => region.name), [
    'Garden Walk', 'Rooftop Rain', 'Workshop Loft', 'Lantern Market', 'Beacon Keep',
  ])
  assert.deepEqual(LEVELS.map(level => level.id), CAMPAIGN_ORDER)
  assert.deepEqual(LEVELS.map(level => level.order), Array.from({ length: 20 }, (_, index) => index + 1))
  assert.deepEqual(REGIONS.map(region => LEVELS.filter(level => level.region === region.id).length), [4, 4, 4, 4, 4])
  assert.equal(new Set(LEVELS.map(level => JSON.stringify(level.terrain))).size, 20)
  assert.deepEqual(validateCampaign(), [])
  assert.equal(assertCampaign(), LEVELS)
})

test('every stop has its kid-readable goals and the hazards progress by place', () => {
  const enemyByRegion = {
    garden: 'mossling',
    rooftop: 'drizzlet',
    workshop: 'gearling',
    market: 'mothlight',
    keep: 'sentry',
  }
  const introduced = LEVELS.flatMap(level => level.introduces)
  assert.equal(new Set(introduced).size, LEVELS.length)

  for (const level of LEVELS) {
    assert.ok(level.objects.filter(object => object[1] === 'seed').length >= 3, level.id)
    assert.equal(level.objects.filter(object => object[1] === 'checkpoint').length, 1, level.id)
    if (level.order > 1) {
      assert.ok(level.objects.some(object => object[1] === enemyByRegion[level.region]), level.id)
    }
  }
  assert.ok(LEVELS.at(-1).objects.some(object => object[1] === 'warden'))
})

test('validator rejects malformed, out-of-bounds, duplicate, and misordered data', () => {
  const cases = [
    ['schema', campaign => { campaign[0].terrain[0] = ['broken'] }, /expected \[id, kind, x, y, width, height\]/],
    ['bounds', campaign => { campaign[0].objects[0][2] = campaign[0].size[0] }, /point is out of bounds/],
    ['duplicate ids', campaign => { campaign[0].objects[0][0] = campaign[0].finish[0] }, /duplicate id/],
    ['campaign order', campaign => { [campaign[0], campaign[1]] = [campaign[1], campaign[0]] }, /expected campaign id garden-1/],
    ['missing stop', campaign => { campaign.pop() }, /campaign must contain 20 levels/],
  ]

  for (const [name, mutate, expected] of cases) {
    const campaign = copy()
    mutate(campaign)
    assert.match(validateCampaign(campaign).join('\n'), expected, name)
  }
})

test('validator catches embedded seeds and checkpoints', () => {
  for (const kind of ['seed', 'checkpoint']) {
    const campaign = copy()
    const object = campaign[0].objects.find(candidate => candidate[1] === kind)
    object[2] = 1
    object[3] = 15
    assert.match(validateCampaign(campaign).join('\n'), new RegExp(`${object[0]} is embedded in terrain`), kind)
  }
})

test('validator catches a finish beyond the conservative three-tile jump gap', () => {
  const campaign = copy()
  const level = campaign[0]
  level.terrain = level.terrain.filter(tile => tile[0] !== 'g01-g')
  const finalGround = level.terrain.find(tile => tile[0] === 'g01-d')
  finalGround[2] = 43
  finalGround[4] = 15
  assert.match(validateCampaign(campaign).join('\n'), /finish bell is outside the conservative jump envelope/)
  assert.throws(() => assertCampaign(campaign), /Invalid Jumpit campaign/)
})

test('validator catches a finish four tiles above the tuned jump rise', () => {
  const campaign = copy()
  const level = campaign[0]
  level.terrain.push(['g01-too-high', 'leaf', 50, 11, 3, 1])
  level.finish[1] = 51
  level.finish[2] = 10
  assert.match(validateCampaign(campaign).join('\n'), /finish bell is outside the conservative jump envelope/)
})

test('campaign text contains no borrowed platform-game identity', () => {
  const authoredText = JSON.stringify(LEVELS).toLowerCase()
  for (const borrowed of ['mario', 'luigi', 'goomba', 'koopa', 'mushroom kingdom', 'question block']) {
    assert.ok(!authoredText.includes(borrowed), borrowed)
  }
})
