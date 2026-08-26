import { currentSeed, isDaily, shareSeed } from './seed.js'
import { createAudio } from './audio.js'
import { challengeWon, dailyChallenge } from './daily.js'
import { createGame } from './game.js'
import { wireInstall } from './install.js'
import { LEVELS, REGIONS } from './levels.js'
import { createRelease } from './release.js'
import { createSaveStore } from './save.js'
import { wireUpdate, registerWorker } from './update.js'
import { VERSION } from './version.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const gameScreen = $('game')
const howto = $('howto')
const overlay = $('game-overlay')
const HOW_TO_PLAY = Object.freeze({
  title: 'How to play',
  steps: [
    'Move along the garden trail.',
    'Jump over gaps and onto safe paths.',
    'Gather lantern seeds and reach the bell.',
  ],
  copy: 'Hold a direction to run. Tap or hold JUMP for a short or high leap. Reach the golden bell.',
})
const release = createRelease(LEVELS, 20)
const releaseLevels = release.levels
const activeSeed = currentSeed()
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

function fillHowto({ title, steps, copy }) {
  howto.querySelector('h2').textContent = title
  howto.querySelector('ol').replaceChildren(...steps.map(text => {
    const item = document.createElement('li')
    item.textContent = text
    return item
  }))
  howto.querySelector('.small').textContent = copy
}

const store = createSaveStore({ onChange: renderMenu })
save = store.get()
const audio = createAudio({
  readMuted: () => store.get().muted,
  writeMuted: value => store.setMuted(value),
})

const game = createGame($('stage'), state => {
  const challengeFinished = Boolean(activeChallenge && state.finished)
  const campaignFinished = !activeChallenge && state.finished && state.levelId === 'keep-4'
  const stamped = challengeFinished && challengeWon(activeChallenge, state)
  $('level-name').textContent = state.levelName.toUpperCase()
  $('seed-count').textContent = `◆ ${state.seeds}/${state.maxSeeds}`
  $('pause').textContent = state.paused ? '▶' : 'Ⅱ'
  $('pause').setAttribute('aria-label', state.paused ? 'resume game' : 'pause game')
  $('game-status').textContent = state.message
  const guardianActive = Number.isFinite(state.guardianMax) && state.guardianMax > 0
  $('guardian-status').hidden = !guardianActive
  $('guardian-status').textContent = guardianActive
    ? state.guardianDefeated
      ? 'WARDEN CLEARED · BELL READY'
      : `WARDEN ${state.guardianHealth}/${state.guardianMax} · BELL LOCKED`
    : ''
  const overlayVisible = state.paused || state.finished
  overlay.hidden = !overlayVisible
  $('game-bar').inert = overlayVisible
  $('controls').inert = overlayVisible
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
      ? 'YOU LIT THE BEACON. ALL FIVE PLACES GLOW AGAIN.'
      : state.finished
      ? `${state.seeds} OF ${state.maxSeeds} LANTERN SEEDS FOUND`
      : 'The trail waits for you.'
  $('resume').hidden = !state.paused
  $('restart').textContent = campaignFinished
    ? 'PLAY THE KEEP AGAIN'
    : state.finished ? challengeFinished && !stamped ? 'TRY AGAIN' : 'RUN IT AGAIN' : 'START OVER'
  $('ending-home').hidden = !overlayVisible

  if (overlayVisible && !overlayOpen) {
    overlayOpen = true
    queueMicrotask(() => (campaignFinished ? $('ending-home') : state.paused ? $('resume') : $('restart')).focus({ preventScroll: true }))
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
      : cue === 'guardian-hit' ? [24, 24, 34]
        : ['seed', 'stomp', 'checkpoint', 'guardian-locked'].includes(cue) ? 24 : 0
  if (pulse) navigator.vibrate?.(pulse)
})

const controlBindings = [['move-left', 'left'], ['move-right', 'right'], ['jump', 'jump']]
const activeInputs = new Set()
const releaseTimers = new Map()

function pressInput(action, button) {
  clearTimeout(releaseTimers.get(action))
  releaseTimers.delete(action)
  if (activeInputs.has(action)) return
  activeInputs.add(action)
  button.setAttribute('data-held', '')
  game.setInput(action, true)
}

function releaseInput(action, button) {
  clearTimeout(releaseTimers.get(action))
  releaseTimers.delete(action)
  if (!activeInputs.delete(action) && !button.hasAttribute('data-held')) return
  button.removeAttribute('data-held')
  game.setInput(action, false)
}

function releaseAllInputs() {
  for (const [id, action] of controlBindings) {
    clearTimeout(releaseTimers.get(action))
    $(id).removeAttribute('data-held')
    game.setInput(action, false)
  }
  releaseTimers.clear()
  activeInputs.clear()
  game.clearInput()
}

function pauseForInterruption() {
  releaseAllInputs()
  void audio.suspend()
  if (!gameScreen.hidden) game.pause()
}

function show(screen) {
  for (const element of [menu, gameScreen]) element.hidden = element !== screen
}

function playLevel(levelId = store.get().selectedLevel, challenge = null) {
  levelId = challenge
    ? release.find(challenge.levelId)?.id
    : release.playable(levelId, store.get().unlocked)
  if (!levelId) return
  void audio.startFromGesture().then(ready => { if (ready) audio.cue('start') })
  activeChallenge = challenge
  if (!challenge) store.selectLevel(levelId)
  queuedNext = null
  lastCompleted = null
  show(gameScreen)
  game.start(levelId, challenge?.seed ?? activeSeed)
  $('pause').focus({ preventScroll: true })
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
  for (const [index, level] of releaseLevels.entries()) {
    if (index % 4 === 0) {
      const heading = document.createElement('h3')
      heading.className = 'region-divider'
      heading.textContent = REGIONS.find(region => region.id === level.region)?.name.toUpperCase() || level.region.toUpperCase()
      trailNodes.push(heading)
    }
    trailNodes.push(trailButton(level, index, save))
  }
  $('trail-list').replaceChildren(...trailNodes)
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

window.addEventListener('resize', () => game.resize())
$('version').textContent = `v${VERSION}`
$('play').addEventListener('click', () => playLevel())
$('daily-play')?.addEventListener('click', () => playLevel(featuredChallenge.levelId, featuredChallenge))
$('back').addEventListener('click', () => {
  releaseAllInputs()
  game.stop()
  activeChallenge = null
  show(menu)
  renderMenu()
  $('play').focus({ preventScroll: true })
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
$('ending-home').addEventListener('click', () => {
  releaseAllInputs()
  game.stop()
  activeChallenge = null
  show(menu)
  openTab('play')
  renderMenu()
  $('play').focus({ preventScroll: true })
})

for (const [id, action] of controlBindings) {
  const button = $(id)
  const release = event => {
    event.preventDefault()
    releaseInput(action, button)
  }
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    try { button.setPointerCapture?.(event.pointerId) } catch {}
    pressInput(action, button)
  })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
  button.addEventListener('click', event => {
    if (event.detail !== 0) return
    pressInput(action, button)
    releaseTimers.set(action, setTimeout(() => releaseInput(action, button), 120))
  })
  for (const type of ['keydown', 'keyup']) button.addEventListener(type, event => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  })
}

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
$('about-open').addEventListener('click', () => $('about').showModal())
$('about-close').addEventListener('click', () => $('about').close())

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
document.addEventListener('pointerdown', () => { void audio.startFromGesture() }, { once: true })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForInterruption()
})
window.addEventListener('pagehide', pauseForInterruption)
window.addEventListener('blur', pauseForInterruption)
wireUpdate($('update'))
registerWorker()
