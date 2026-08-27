import { currentSeed, isDaily, shareSeed } from './seed.js'
import { createAudio } from './audio.js'
import { challengeWon, dailyChallenge } from './daily.js'
import { createGame } from './game.js?v=11'
import { wireInstall } from './install.js'
import { LEVELS, REGIONS } from './levels.js?v=2'
import { createRelease } from './release.js'
import { createSaveStore } from './save.js?v=2'
import { wireUpdate, registerWorker } from './update.js?v=4'
import { VERSION } from './version.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const gameScreen = $('game')
const howto = $('howto')
const about = $('about')
const overlay = $('game-overlay')
const rotateDevice = $('rotate-device')
const updateButton = $('update')
const HOW_TO_PLAY = Object.freeze({
  title: 'How to play',
  steps: [
    'Touch the left side, then slide to run.',
    'Tap the right side to jump.',
    'Gather lantern seeds and reach the bell.',
  ],
  copy: 'Slide left to run. Tap anywhere on the right side to jump.',
})
const release = createRelease(LEVELS, 20)
const releaseLevels = release.levels
const hiddenLights = releaseLevels.flatMap(level => level.objects
  .filter(([, kind]) => kind === 'hidden-light')
  .map(([id]) => ({ id, region: level.region })))
const hiddenLightByRegion = new Map(hiddenLights.map(light => [light.region, light.id]))
const activeSeed = currentSeed()
const directChallenge = new URLSearchParams(location.search).has('seed')
const featuredChallenge = {
  ...dailyChallenge(activeSeed),
  seed: activeSeed,
  daily: isDaily(activeSeed),
}
const looks = [
  { id: 'garden', unlocked: () => true, label: 'Garden' },
  { id: 'dusk', unlocked: () => true, label: 'Dusk' },
  { id: 'rain', unlocked: state => state.completed.includes('rooftop-4'), label: 'Rain', goal: 'clear Rooftop Rain' },
  { id: 'lantern', unlocked: state => state.completed.includes('market-4'), label: 'Lantern', goal: 'clear Lantern Market' },
]
let save
let queuedNext = null
let lastCompleted = null
let activeChallenge = null
let overlayOpen = false
let orientationBlocked = false
let respawning = false
let pendingPlay = null
let pendingAudio = null
let pendingNeedsResume = false
let gameStarted = false

function fillHowto({ title, steps, copy }) {
  howto.querySelector('h2').textContent = title
  howto.querySelector('ol').replaceChildren(...steps.map(text => {
    const item = document.createElement('li')
    item.textContent = text
    return item
  }))
  howto.querySelector('.small').textContent = copy
}

function showGameStatus(message) {
  const status = $('game-status')
  status.classList.remove('status-pop')
  status.textContent = message
  if (!message) return
  void status.offsetWidth
  status.classList.add('status-pop')
}

function completionCopy(state) {
  const current = release.find(state.levelId)
  if (!current) return ''
  const region = REGIONS.find(item => item.id === current.region)
  const regionLevels = releaseLevels.filter(level => level.region === current.region)
  const completed = new Set(save.completed)
  completed.add(current.id)
  const lit = regionLevels.filter(level => completed.has(level.id)).length
  let copy = `${region?.name || current.region}: ${lit} OF ${regionLevels.length} TRAILS LIT.`
  const next = release.find(release.next(current.id))
  if (next && !save.unlocked.includes(next.id)) {
    const nextRegion = REGIONS.find(item => item.id === next.region)
    copy += ` ${next.region === current.region ? next.name : nextRegion?.name || next.region} IS NOW OPEN.`
  }
  return copy.toUpperCase()
}

const store = createSaveStore({ onChange: renderMenu })
save = store.get()
const audio = createAudio({
  readMuted: () => store.get().muted,
  writeMuted: value => store.setMuted(value),
})

const game = createGame($('stage'), state => {
  if (state.hiddenLightId) store.findHiddenLight(state.hiddenLightId)
  const challengeFinished = Boolean(activeChallenge && state.finished)
  const campaignFinished = !activeChallenge && state.finished && state.levelId === 'keep-4'
  const foundHiddenLights = new Set(save.hiddenLights)
  const hiddenLightEnding = foundHiddenLights.size === hiddenLights.length
    ? ' EVERY HIDDEN LIGHT JOINS THE BEACON.'
    : foundHiddenLights.size
      ? ' THE HIDDEN LIGHTS YOU FOUND TWINKLE TOO.'
      : ''
  const stamped = challengeFinished && challengeWon(activeChallenge, state)
  $('level-name').textContent = state.levelName.toUpperCase()
  $('seed-count').textContent = `◆ ${state.seeds}/${state.maxSeeds}`
  $('pause').textContent = state.paused ? '▶' : 'Ⅱ'
  $('pause').setAttribute('aria-label', state.paused ? 'resume game' : 'pause game')
  showGameStatus(state.message)
  const guardianActive = Number.isFinite(state.guardianMax) && state.guardianMax > 0
  $('guardian-status').hidden = !guardianActive
  $('guardian-status').textContent = guardianActive
    ? state.guardianDefeated
      ? 'WARDEN CLEARED · BELL READY'
      : `WARDEN ${state.guardianHealth}/${state.guardianMax} · BELL LOCKED`
    : ''
  const overlayVisible = state.paused || state.finished
  if (state.respawning && !respawning) releaseAllInputs()
  respawning = state.respawning
  overlay.hidden = !overlayVisible
  $('game-bar').inert = overlayVisible || orientationBlocked
  $('controls').inert = overlayVisible || orientationBlocked || respawning
  overlay.classList.toggle('campaign-ending', campaignFinished)
  $('ending-art').hidden = !campaignFinished
  $('overlay-kicker').textContent = challengeFinished
    ? activeChallenge.daily ? "TODAY'S CHALLENGE" : 'FRIEND CHALLENGE'
    : campaignFinished ? 'THE LIGHT IS HOME'
      : state.finished ? state.regionName.toUpperCase() : 'TAKE A BREATH'
  $('overlay-title').textContent = challengeFinished
    ? stamped ? 'STAMP EARNED!' : 'MORE LIGHT NEEDED'
    : campaignFinished ? 'THE GARDEN GLOWS!'
      : state.finished ? 'TRAIL CLEARED!' : 'PAUSED'
  $('overlay-copy').textContent = challengeFinished
    ? stamped
      ? `${activeChallenge.goalSeeds} SEEDS + BELL · STAMP EARNED`
      : `FOUND ${state.seeds}/${activeChallenge.goalSeeds} SEEDS · TRY AGAIN`
    : campaignFinished
      ? `${completionCopy(state)} YOU LIT THE BEACON. ALL FIVE PLACES GLOW AGAIN.${hiddenLightEnding}`
      : state.finished
      ? completionCopy(state)
      : 'The trail waits for you.'
  $('resume').hidden = !state.paused
  $('restart').textContent = campaignFinished
    ? 'PLAY THE KEEP AGAIN'
    : state.finished ? challengeFinished && !stamped ? 'TRY AGAIN' : 'RUN IT AGAIN' : 'START OVER'
  $('ending-home').hidden = !overlayVisible
  for (const [index, mark] of [...document.querySelectorAll('.ending-light')].entries()) {
    mark.classList.toggle('found', foundHiddenLights.has(hiddenLights[index]?.id))
  }

  if (overlayVisible && !overlayOpen) {
    overlayOpen = true
    queueMicrotask(() => {
      const next = !challengeFinished && state.finished && release.next(state.levelId) ? $('next-trail') : null
      const target = campaignFinished ? $('ending-home') : state.paused ? $('resume') : next || $('restart')
      target.focus()
    })
  } else if (!overlayVisible) {
    overlayOpen = false
  }

  if (challengeFinished) {
    queuedNext = null
    const stampId = `challenge-${activeChallenge.seed}`
    if (stamped && lastCompleted !== stampId) {
      lastCompleted = stampId
      store.completeDaily(activeChallenge.seed)
    }
  } else if (state.finished && lastCompleted !== state.levelId) {
    lastCompleted = state.levelId
    queuedNext = release.next(state.levelId)
    store.completeLevel(state.levelId, state.seeds, queuedNext)
  }
  $('next-trail').hidden = !state.finished || !queuedNext
}, cue => {
  audio.cue(cue)
  const pulse = cue === 'guardian-defeated' ? [35, 25, 35, 25, 80]
    : cue === 'finish' ? [35, 35, 60]
      : cue === 'hidden-light' ? [18, 24, 18, 24, 80]
      : cue === 'guardian-hit' ? [24, 24, 34]
        : ['seed', 'stomp', 'checkpoint', 'guardian-locked'].includes(cue) ? 24 : 0
  if (pulse) navigator.vibrate?.(pulse)
})

const controlBindings = [['move-left', 'left'], ['move-right', 'right'], ['jump', 'jump']]
const activeInputs = new Map()
const releaseTimers = new Map()
const directionZone = $('direction-zone')
let stickPointer = null
let stickSource = ''
let stickOriginX = 0
let stickAction = null

function pressInput(action, button, source) {
  clearTimeout(releaseTimers.get(source))
  releaseTimers.delete(source)
  const sources = activeInputs.get(action) || new Set()
  if (sources.has(source)) return
  const first = sources.size === 0
  sources.add(source)
  activeInputs.set(action, sources)
  button.setAttribute('data-held', '')
  if (first) game.setInput(action, true, `touch:${action}`)
}

function releaseInput(action, button, source) {
  clearTimeout(releaseTimers.get(source))
  releaseTimers.delete(source)
  const sources = activeInputs.get(action)
  if (!sources?.delete(source)) return
  if (sources.size) return
  activeInputs.delete(action)
  button.removeAttribute('data-held')
  game.setInput(action, false, `touch:${action}`)
}

function releaseAllInputs() {
  for (const timer of releaseTimers.values()) clearTimeout(timer)
  for (const [id, action] of controlBindings) {
    $(id).removeAttribute('data-held')
    game.setInput(action, false)
  }
  releaseTimers.clear()
  activeInputs.clear()
  stickPointer = null
  stickSource = ''
  stickAction = null
  directionZone.removeAttribute('data-active')
  directionZone.removeAttribute('data-direction')
  directionZone.style.setProperty('--stick-dx', '0px')
  game.clearInput()
}

function beginPendingPlay() {
  if (!pendingPlay || orientationBlocked) return false
  const next = pendingPlay
  const startPaused = pendingNeedsResume
  pendingPlay = null
  pendingNeedsResume = false
  gameStarted = true
  game.start(next.levelId, { foundHiddenLights: store.get().hiddenLights })
  if (startPaused) game.pause()
  void Promise.resolve(pendingAudio).then(ready => { if (ready) audio.cue('start') })
  pendingAudio = null
  $('pause').focus({ preventScroll: true })
  return true
}

function syncOrientation() {
  const blocked = innerHeight > innerWidth
  const wasBlocked = orientationBlocked
  const inGame = !gameScreen.hidden
  orientationBlocked = blocked
  document.body.classList.toggle('orientation-blocked', blocked)
  $('rotate-home').hidden = !blocked || !inGame
  menu.inert = blocked
  gameScreen.inert = blocked
  updateButton.inert = blocked

  if (blocked) {
    for (const dialog of [howto, about]) if (dialog.open) dialog.close()
    if (!rotateDevice.open) rotateDevice.showModal()
    releaseAllInputs()
    if (!wasBlocked && inGame && gameStarted) game.pause()
    requestAnimationFrame(() => (inGame ? $('rotate-home') : $('rotate-title')).focus({ preventScroll: true }))
    return
  }

  if (wasBlocked && about.open) about.close()
  if (rotateDevice.open) rotateDevice.close()
  if (inGame) {
    if (!beginPendingPlay()) requestAnimationFrame(() => game.resize())
    if (!overlay.hidden) {
      const target = !$('resume').hidden
        ? $('resume')
        : overlay.classList.contains('campaign-ending')
          ? $('ending-home')
          : !$('next-trail').hidden ? $('next-trail') : $('restart')
      requestAnimationFrame(() => target.focus())
    }
  } else if (wasBlocked) {
    const panel = [...document.querySelectorAll('.tab-panel')].find(item => !item.hidden)
    requestAnimationFrame(() => (panel?.querySelector('button:not(:disabled)') || $('play')).focus({ preventScroll: true }))
  }
}

function pauseForInterruption() {
  releaseAllInputs()
  void audio.suspend()
  if (gameScreen.hidden) return
  if (pendingPlay) {
    pendingNeedsResume = true
    pendingAudio = null
    return
  }
  game.pause()
}

function show(screen) {
  for (const element of [menu, gameScreen]) element.hidden = element !== screen
}

function goHome() {
  releaseAllInputs()
  game.stop()
  pendingPlay = null
  pendingAudio = null
  pendingNeedsResume = false
  gameStarted = false
  activeChallenge = null
  show(menu)
  openTab('play')
  renderMenu()
  syncOrientation()
  if (!orientationBlocked) $('play').focus({ preventScroll: true })
}

function playLevel(levelId = store.get().selectedLevel, challenge = null) {
  levelId = challenge
    ? release.find(challenge.levelId)?.id
    : release.playable(levelId, store.get().unlocked)
  if (!levelId) return
  const level = release.find(levelId)
  pendingAudio = audio.startFromGesture()
  activeChallenge = challenge
  if (!challenge) store.selectLevel(levelId)
  queuedNext = null
  lastCompleted = null
  pendingPlay = { levelId }
  pendingNeedsResume = false
  gameStarted = false
  $('level-name').textContent = level.name.toUpperCase()
  $('seed-count').textContent = `◆ 0/${level.objects.filter(([, kind]) => kind === 'seed').length}`
  $('pause').textContent = 'Ⅱ'
  $('pause').setAttribute('aria-label', 'pause game')
  show(gameScreen)
  syncOrientation()
}

function openTab(name) {
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== `${name}-panel`
  for (const button of document.querySelectorAll('.nav-item')) button.setAttribute('aria-pressed', String(button.dataset.tab === name))
  store.disarmReset()
  $('reset-progress').removeAttribute('data-armed')
  $('reset-progress').textContent = 'RESET PROGRESS'
}

function trailButton(level, index, state) {
  const unlocked = state.unlocked.includes(level.id)
  const button = document.createElement('button')
  button.className = 'trail-button'
  button.disabled = !unlocked
  button.setAttribute('aria-current', String(state.selectedLevel === level.id))
  button.setAttribute('aria-label', unlocked ? `Play ${level.name}` : `${level.name} locked`)

  const number = document.createElement('span')
  number.className = 'trail-number'
  number.textContent = unlocked ? String(index + 1) : '×'
  const meta = document.createElement('span')
  meta.className = 'trail-meta'
  const name = document.createElement('b')
  name.textContent = level.name.toUpperCase()
  const status = document.createElement('small')
  status.textContent = state.completed.includes(level.id) ? 'TRAIL CLEARED' : unlocked ? 'READY TO RUN' : 'CLEAR THE TRAIL BEFORE IT'
  meta.append(name, status)
  const seeds = document.createElement('span')
  seeds.className = 'trail-seeds'
  const maxSeeds = level.objects.filter(([, kind]) => kind === 'seed').length
  seeds.textContent = unlocked ? `◆ ${state.bestSeeds[level.id] || 0}/${maxSeeds}` : 'LOCKED'
  button.append(number, meta, seeds)
  if (unlocked) button.addEventListener('click', () => playLevel(level.id))
  return button
}

function sleepingPlace(region, previous) {
  const row = document.createElement('div')
  row.className = 'sleeping-place'
  const moon = document.createElement('span')
  moon.className = 'sleeping-place-mark'
  moon.setAttribute('aria-hidden', 'true')
  moon.textContent = '☾'
  const copy = document.createElement('span')
  const name = document.createElement('b')
  name.textContent = region.name.toUpperCase()
  const status = document.createElement('small')
  status.textContent = `SLEEPING · CLEAR ${previous?.name.toUpperCase() || 'THE PREVIOUS PLACE'} TO WAKE`
  copy.append(name, status)
  row.append(moon, copy)
  return row
}

function lookUnlocked(state, id) {
  return Boolean(looks.find(look => look.id === id)?.unlocked(state))
}

function renderMenu(nextState = store.get()) {
  save = nextState
  const selectedLook = lookUnlocked(save, save.theme) ? save.theme : 'garden'
  document.documentElement.dataset.theme = selectedLook
  const selectedId = release.playable(save.selectedLevel, save.unlocked)
  const selected = release.find(selectedId) || releaseLevels[0]
  const selectedMax = selected.objects.filter(([, kind]) => kind === 'seed').length
  const campaignComplete = save.completed.includes('keep-4')
  $('hero-kicker').textContent = campaignComplete ? 'THE BEACON IS AWAKE' : 'THE GARDEN NEEDS A LIGHT'
  $('hero-title').textContent = campaignComplete ? 'You brought light home.' : 'Run it home.'
  $('play').textContent = campaignComplete ? 'RUN THE KEEP AGAIN' : 'PLAY THE TRAIL'
  $('continue-label').textContent = `${selected.name.toUpperCase()} · ${save.bestSeeds[selected.id] || 0}/${selectedMax} SEEDS`
  const trailSummary = $('trail-summary')
  if (trailSummary) {
    const placeCount = new Set(releaseLevels.map(level => level.region)).size
    trailSummary.textContent = `${releaseLevels.length} TRAILS · ${placeCount} PLACES`
  }
  const dailyWon = save.dailyWins.includes(activeSeed)
  for (const [id, text] of [
    ['daily-kicker', featuredChallenge.daily ? "TODAY'S CHALLENGE" : 'FRIEND CHALLENGE'],
    ['daily-title', featuredChallenge.title],
    ['daily-copy', featuredChallenge.copy],
    ['daily-status', dailyWon ? 'STAMP EARNED' : `◆ ${featuredChallenge.goalSeeds} SEEDS + BELL`],
  ]) {
    if ($(id)) $(id).textContent = text
  }
  if ($('daily-play')) $('daily-play').textContent = dailyWon ? 'PLAY AGAIN' : 'PLAY CHALLENGE'
  const trailNodes = []
  for (const [regionIndex, region] of REGIONS.entries()) {
    const placeLevels = releaseLevels.filter(level => level.region === region.id)
    if (!placeLevels.length) continue
    const reached = placeLevels.some(level => save.unlocked.includes(level.id) || save.completed.includes(level.id))
    if (!reached) {
      trailNodes.push(sleepingPlace(region, REGIONS[regionIndex - 1]))
      continue
    }
    const heading = document.createElement('h3')
    heading.className = 'region-divider'
    const lightFound = save.hiddenLights.includes(hiddenLightByRegion.get(region.id))
    heading.textContent = `${region.name.toUpperCase()}${lightFound ? ' · ✦ LIGHT FOUND' : ''}`
    trailNodes.push(heading)
    for (const level of placeLevels) trailNodes.push(trailButton(level, releaseLevels.indexOf(level), save))
  }
  $('trail-list').replaceChildren(...trailNodes)
  const hiddenLightStrip = $('hidden-lights')
  if (hiddenLightStrip) {
    const found = new Set(save.hiddenLights)
    hiddenLightStrip.hidden = found.size === 0
    hiddenLightStrip.setAttribute('aria-label', `Hidden lights found: ${found.size} of ${hiddenLights.length}`)
    $('hidden-light-label').textContent = found.size === hiddenLights.length ? 'ALL FIVE GLOW' : `${found.size} OF ${hiddenLights.length} GLOW`
    $('hidden-light-stamps').replaceChildren(...REGIONS.map(region => {
      const stamp = document.createElement('span')
      const lit = found.has(hiddenLightByRegion.get(region.id))
      stamp.className = `hidden-light-stamp${lit ? ' found' : ''}`
      stamp.textContent = lit ? '✦' : '◇'
      stamp.setAttribute('aria-label', `${region.name}: ${lit ? 'found' : 'sleeping'}`)
      return stamp
    }))
  }
  for (const look of looks) {
    const button = $('look-' + look.id)
    if (!button) continue
    const unlocked = look.unlocked(save)
    button.disabled = !unlocked
    button.setAttribute('aria-disabled', String(!unlocked))
    button.setAttribute('aria-pressed', String(selectedLook === look.id))
    button.setAttribute('aria-label', unlocked ? `Use ${look.label} look` : `${look.label} look locked, ${look.goal}`)
    const status = button.querySelector('.look-status')
    if (status) status.hidden = unlocked
  }
  $('sound-toggle').textContent = save.muted ? 'SOUND OFF' : 'SOUND ON'
}

window.addEventListener('resize', syncOrientation)
$('version').textContent = `v${VERSION}`
$('play').addEventListener('click', () => playLevel())
$('daily-play')?.addEventListener('click', () => playLevel(featuredChallenge.levelId, featuredChallenge))
$('back').addEventListener('click', goHome)
$('rotate-home').addEventListener('click', goHome)
$('rotate-device').addEventListener('cancel', event => event.preventDefault())
$('rotate-device').addEventListener('keydown', event => {
  if (event.key !== 'Tab') return
  const targets = [...rotateDevice.querySelectorAll('button:not([hidden]):not(:disabled)')]
  if (!targets.length) return
  const current = targets.indexOf(document.activeElement)
  const next = event.shiftKey
    ? current <= 0 ? targets.length - 1 : current - 1
    : current < 0 || current === targets.length - 1 ? 0 : current + 1
  event.preventDefault()
  targets[next].focus()
})
$('pause').addEventListener('click', () => {
  releaseAllInputs()
  game.togglePause()
})
$('resume').addEventListener('click', () => {
  void audio.startFromGesture()
  game.togglePause()
  $('pause').focus({ preventScroll: true })
})
$('restart').addEventListener('click', () => {
  releaseAllInputs()
  void audio.startFromGesture()
  game.restart()
  $('pause').focus({ preventScroll: true })
})
$('next-trail').addEventListener('click', () => playLevel(queuedNext))
$('ending-home').addEventListener('click', goHome)

for (const [id, action] of controlBindings) {
  const button = $(id)
  const release = event => {
    const source = `${id}:pointer:${event.pointerId}`
    if (!activeInputs.get(action)?.has(source)) return
    event.preventDefault()
    releaseInput(action, button, source)
  }
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    if (action === 'jump') {
      const bounds = button.getBoundingClientRect()
      button.style.setProperty('--touch-x', `${event.clientX - bounds.left}px`)
      button.style.setProperty('--touch-y', `${event.clientY - bounds.top}px`)
    }
    try { button.setPointerCapture?.(event.pointerId) } catch {}
    pressInput(action, button, `${id}:pointer:${event.pointerId}`)
  })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
  if (action === 'jump') {
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }
  button.addEventListener('click', event => {
    if (event.detail !== 0) return
    const source = `${id}:activation`
    pressInput(action, button, source)
    releaseTimers.set(source, setTimeout(() => releaseInput(action, button, source), 120))
  })
  for (const type of ['keydown', 'keyup']) button.addEventListener(type, event => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  })
}

function setStickAction(action) {
  if (action === stickAction) return
  if (stickAction) releaseInput(stickAction, $(`move-${stickAction}`), stickSource)
  stickAction = action
  if (action) pressInput(action, $(`move-${action}`), stickSource)
  if (action) directionZone.dataset.direction = action
  else directionZone.removeAttribute('data-direction')
}

function moveStick(event) {
  const dx = event.clientX - stickOriginX
  const action = stickAction === 'right' && dx > 8 ? 'right'
    : stickAction === 'left' && dx < -8 ? 'left'
      : dx > 14 ? 'right' : dx < -14 ? 'left' : null
  directionZone.style.setProperty('--stick-dx', `${Math.max(-42, Math.min(42, dx))}px`)
  setStickAction(action)
}

function releaseStick(event) {
  if (event.pointerId !== stickPointer) return
  event.preventDefault()
  setStickAction(null)
  stickPointer = null
  stickSource = ''
  directionZone.removeAttribute('data-active')
  directionZone.style.setProperty('--stick-dx', '0px')
}

directionZone.addEventListener('pointerdown', event => {
  if (event.button > 0 || event.target.closest?.('button') || stickPointer !== null || !gameStarted || orientationBlocked || !overlay.hidden) return
  event.preventDefault()
  stickPointer = event.pointerId
  stickSource = `stick:pointer:${event.pointerId}`
  stickOriginX = event.clientX
  const bounds = directionZone.getBoundingClientRect()
  directionZone.style.setProperty('--stick-x', `${event.clientX - bounds.left}px`)
  directionZone.style.setProperty('--stick-y', `${event.clientY - bounds.top}px`)
  directionZone.style.setProperty('--stick-dx', '0px')
  directionZone.setAttribute('data-active', '')
  try { directionZone.setPointerCapture?.(event.pointerId) } catch {}
})
directionZone.addEventListener('pointermove', event => {
  if (event.pointerId !== stickPointer) return
  event.preventDefault()
  moveStick(event)
})
directionZone.addEventListener('pointerup', releaseStick)
directionZone.addEventListener('pointercancel', releaseStick)
directionZone.addEventListener('lostpointercapture', releaseStick)
directionZone.addEventListener('click', event => event.preventDefault())
window.addEventListener('pointerup', releaseStick)
window.addEventListener('pointercancel', releaseStick)

for (const button of document.querySelectorAll('.nav-item')) button.addEventListener('click', () => {
  audio.cue('tap')
  openTab(button.dataset.tab)
})
for (const look of looks) $('look-' + look.id)?.addEventListener('click', () => {
  if (look.unlocked(store.get())) store.setTheme(look.id)
})

$('sound-toggle').addEventListener('click', () => {
  const muted = audio.setMuted(!audio.isMuted())
  if (!muted) void audio.startFromGesture().then(ready => { if (ready) audio.cue('start') })
})

$('reset-progress').addEventListener('click', event => {
  const button = event.currentTarget
  if (!store.resetArmed()) {
    store.requestReset()
    button.setAttribute('data-armed', '')
    button.textContent = 'TAP AGAIN TO RESET'
    return
  }
  store.reset()
  button.removeAttribute('data-armed')
  button.textContent = 'RESET PROGRESS'
  openTab('play')
})

$('howto-open').addEventListener('click', () => {
  fillHowto(HOW_TO_PLAY)
  howto.showModal()
})
$('howto-close').addEventListener('click', () => howto.close())
$('about-open').addEventListener('click', () => about.showModal())
$('rotate-about').addEventListener('click', () => about.showModal())
$('about-close').addEventListener('click', () => about.close())

$('friends').addEventListener('click', async event => {
  const button = event.currentTarget
  const original = button.textContent
  const result = await shareSeed(activeSeed, 'Jumpit')
  if (result === 'copied') button.textContent = 'LINK COPIED'
  if (result === 'failed') button.textContent = 'COULD NOT SHARE'
  if (result === 'copied' || result === 'failed') {
    setTimeout(() => { button.textContent = original }, 2200)
  }
})

wireInstall($('install'), {
  showIosHint: () => {
    fillHowto({
      title: 'Add to home screen',
      steps: [
        'Tap the share button at the bottom of Safari.',
        'Scroll down and tap Add to Home Screen.',
        'Tap Add. It opens like an app and works offline.',
      ],
      copy: '',
    })
    howto.showModal()
  },
})

renderMenu(save)
if (directChallenge) openTab('more')
syncOrientation()
document.addEventListener('pointerdown', () => { void audio.startFromGesture() }, { once: true })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForInterruption()
})
window.addEventListener('pagehide', pauseForInterruption)
window.addEventListener('blur', pauseForInterruption)
wireUpdate(updateButton)
registerWorker()
