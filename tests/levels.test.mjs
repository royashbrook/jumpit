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

test('each place has one authored optional hidden light on a reachable side ledge', () => {
  const hiddenLights = LEVELS.flatMap(entry => entry.objects
    .filter(([, kind]) => kind === 'hidden-light')
    .map(([id, kind, x, y]) => [entry.id, entry.region, id, kind, x, y]))

  assert.deepEqual(hiddenLights, [
    ['garden-3', 'garden', 'g03-hidden-light', 'hidden-light', 7, 11],
    ['rooftop-3', 'rooftop', 'r03-hidden-light', 'hidden-light', 31, 11],
    ['workshop-2', 'workshop', 'w02-hidden-light', 'hidden-light', 8, 11],
    ['market-3', 'market', 'm03-hidden-light', 'hidden-light', 26, 11],
    ['keep-1', 'keep', 'k01-hidden-light', 'hidden-light', 8, 12],
  ])
  assert.deepEqual(
    REGIONS.map(region => hiddenLights.filter(([, itemRegion]) => itemRegion === region.id).length),
    [1, 1, 1, 1, 1],
  )
})

test('First Light is a short run-jump-stomp lesson before the glow cloak', () => {
  const first = LEVELS[0]
  const second = LEVELS[1]
  assert.deepEqual(first.size, [38, 18])
  assert.deepEqual(first.finish, ['g01-bell', 35, 14])
  assert.deepEqual(first.introduces, ['run-jump-stomp'])
  assert.deepEqual(first.terrain, [
    ['g01-a', 'ground', 0, 15, 18, 3], ['g01-b', 'ground', 19, 15, 12, 3],
    ['g01-c', 'ground', 32, 15, 6, 3], ['g01-d', 'leaf', 7, 12, 5, 1],
    ['g01-e', 'leaf', 25, 12, 5, 1],
  ])
  assert.deepEqual(first.objects, [
    ['g01-seed-a', 'seed', 4, 14], ['g01-seed-b', 'seed', 10, 11],
    ['g01-seed-c', 'seed', 27, 11], ['g01-check', 'checkpoint', 21, 14],
    ['g01-moss-a', 'mossling', 9, 14],
  ])
  assert.deepEqual(second.introduces, ['glow-cloak'])
  assert.deepEqual(
    LEVELS.flatMap(entry => entry.objects).filter(([, kind]) => kind === 'cloak'),
    [['g02-cloak', 'cloak', 8, 11]],
  )
})

test('Beacon Keep climbs in readable tiers while sentries build one encounter at a time', () => {
  const keep = LEVELS.filter(level => level.region === 'keep')
  assert.deepEqual(keep.map(level => level.size[0]), [72, 78, 84, 96])
  assert.deepEqual(
    keep.slice(0, 3).map(level => level.objects.filter(([, kind]) => kind === 'sentry').length),
    [1, 2, 3],
  )
  for (const level of keep) {
    const platformTiers = new Set(level.terrain.filter(([, , , , , height]) => height === 1).map(([, , , y]) => y))
    assert.ok(platformTiers.size >= 3, `${level.id} lost its fortress climb`)
    assert.ok(Math.min(...platformTiers) <= 9, `${level.id} lost its high route`)
  }
})

test('the final checkpoint leads into one guarded, locked bell arena', () => {
  const final = LEVELS.find(level => level.id === 'keep-4')
  const arena = final.terrain.find(([id]) => id === 'k04-arena')
  const checkpoint = final.objects.find(([, kind]) => kind === 'checkpoint')
  const wardens = final.objects.filter(([, kind]) => kind === 'warden')
  const warden = wardens[0]
  const [, finishX, finishY] = final.finish
  const [, , arenaX, arenaY, arenaWidth] = arena

  assert.equal(final.introduces[0], 'beacon-guardian')
  assert.equal(LEVELS.flatMap(level => level.objects).filter(([, kind]) => kind === 'warden').length, 1)
  assert.equal(wardens.length, 1)
  assert.ok(checkpoint[2] < arenaX, 'checkpoint must stay before the arena')
  assert.ok(warden[2] >= arenaX && warden[2] < finishX, 'warden must stand between entry and bell')
  assert.ok(finishX >= arenaX && finishX < arenaX + arenaWidth, 'bell must stay inside the arena')
  assert.equal(warden[3], finishY)
  assert.equal(finishY, arenaY - 1)
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

test('validator rejects checkpoints on terrain that disappears', () => {
  const campaign = copy()
  const level = campaign.find(entry => entry.id === 'garden-4')
  const checkpoint = level.objects.find(([, kind]) => kind === 'checkpoint')
  checkpoint[2] = 42
  assert.match(validateCampaign(campaign).join('\n'), /g04-check must have stable supporting terrain/)
})

test('validator keeps every hidden light unique, supported, and reachable', () => {
  const missing = copy()
  const missingGarden = missing.find(entry => entry.id === 'garden-3')
  missingGarden.objects = missingGarden.objects.filter(([, kind]) => kind !== 'hidden-light')
  assert.match(validateCampaign(missing).join('\n'), /Garden Walk: needs exactly one hidden light, found 0/)

  const duplicate = copy()
  duplicate.find(entry => entry.id === 'garden-4').objects.push(['g04-hidden-light', 'hidden-light', 9, 11])
  assert.match(validateCampaign(duplicate).join('\n'), /Garden Walk: needs exactly one hidden light, found 2/)

  const embedded = copy()
  const embeddedLight = embedded.find(entry => entry.id === 'garden-3').objects
    .find(([, kind]) => kind === 'hidden-light')
  embeddedLight[3] = 12
  assert.match(validateCampaign(embedded).join('\n'), /g03-hidden-light is embedded in terrain/)

  const unreachable = copy()
  const unreachableLight = unreachable.find(entry => entry.id === 'garden-3').objects
    .find(([, kind]) => kind === 'hidden-light')
  unreachableLight[3] = 7
  assert.match(validateCampaign(unreachable).join('\n'), /g03-hidden-light is outside the conservative jump envelope/)
})

test('validator catches a finish beyond the conservative three-tile jump gap', () => {
  const campaign = copy()
  const level = campaign[0]
  const finalGround = level.terrain.find(tile => tile[0] === 'g01-c')
  finalGround[2] = 35
  finalGround[4] = 3
  assert.match(validateCampaign(campaign).join('\n'), /finish bell is outside the conservative jump envelope/)
  assert.throws(() => assertCampaign(campaign), /Invalid Jumpit campaign/)
})

test('validator catches a finish four tiles above the tuned jump rise', () => {
  const campaign = copy()
  const level = campaign[0]
  const highLeaf = level.terrain.find(tile => tile[0] === 'g01-e')
  highLeaf[2] = 32
  highLeaf[3] = 11
  highLeaf[4] = 3
  level.finish[1] = 33
  level.finish[2] = 10
  assert.match(validateCampaign(campaign).join('\n'), /finish bell is outside the conservative jump envelope/)
})

test('campaign text contains no borrowed platform-game identity', () => {
  const authoredText = JSON.stringify(LEVELS).toLowerCase()
  for (const borrowed of ['mario', 'luigi', 'goomba', 'koopa', 'mushroom kingdom', 'question block']) {
    assert.ok(!authoredText.includes(borrowed), borrowed)
  }
})
