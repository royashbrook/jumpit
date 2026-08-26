import { currentSeed, shareSeed } from './seed.js'
import { createAudio } from './audio.js'
import { createGame } from './game.js'
import { wireInstall } from './install.js'
import { LEVELS, REGIONS } from './levels.js'
import { createSaveStore } from './save.js'
import { wireUpdate, registerWorker } from './update.js'
import { VERSION } from './version.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const gameScreen = $('game')
const howto = $('howto')
const overlay = $('game-overlay')
const releaseLevels = LEVELS.slice(0, 12)
let save
let queuedNext = null
let lastCompleted = null

const store = createSaveStore({ onChange: renderMenu })
save = store.get()
const audio = createAudio({
  readMuted: () => store.get().muted,
  writeMuted: value => store.setMuted(value),
})

const game = createGame($('stage'), state => {
  $('level-name').textContent = state.levelName.toUpperCase()
  $('seed-count').textContent = `◆ ${state.seeds}/${state.maxSeeds}`
  $('pause').textContent = state.paused ? '▶' : 'Ⅱ'
  $('pause').setAttribute('aria-label', state.paused ? 'resume game' : 'pause game')
  $('game-status').textContent = state.message
  overlay.hidden = !state.paused && !state.finished
  $('overlay-kicker').textContent = state.finished ? state.regionName.toUpperCase() : 'TAKE A BREATH'
  $('overlay-title').textContent = state.finished ? 'TRAIL CLEARED!' : 'PAUSED'
  $('overlay-copy').textContent = state.finished
    ? `${state.seeds} OF ${state.maxSeeds} LANTERN SEEDS FOUND`
    : 'The trail waits for you.'
  $('resume').hidden = !state.paused
  $('restart').textContent = state.finished ? 'RUN IT AGAIN' : 'START OVER'

  if (state.finished && lastCompleted !== state.levelId) {
    lastCompleted = state.levelId
    const levelIndex = LEVELS.findIndex(level => level.id === state.levelId)
    queuedNext = LEVELS[levelIndex + 1]?.id || null
    store.completeLevel(state.levelId, state.seeds, queuedNext)
  }
  $('next-trail').hidden = !state.finished || !queuedNext
}, cue => {
  audio.cue(cue)
  const pulse = cue === 'finish' ? [35, 35, 60] : ['seed', 'stomp', 'checkpoint'].includes(cue) ? 24 : 0
  if (pulse) navigator.vibrate?.(pulse)
})

function show(screen) {
  for (const element of [menu, gameScreen]) element.hidden = element !== screen
}

function playLevel(levelId = store.get().selectedLevel) {
  audio.startFromGesture()
  audio.cue('start')
  store.selectLevel(levelId)
  queuedNext = null
  lastCompleted = null
  show(gameScreen)
  game.start(levelId, currentSeed())
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

function renderMenu(nextState = store.get()) {
  save = nextState
  document.documentElement.dataset.theme = save.theme
  const selected = LEVELS.find(level => level.id === save.selectedLevel) || LEVELS[0]
  const selectedMax = selected.objects.filter(([, kind]) => kind === 'seed').length
  $('continue-label').textContent = `${selected.name.toUpperCase()} · ${save.bestSeeds[selected.id] || 0}/${selectedMax} SEEDS`
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
  for (const look of ['garden', 'dusk']) $('look-' + look).setAttribute('aria-pressed', String(save.theme === look))
  $('sound-toggle').textContent = save.muted ? 'SOUND OFF' : 'SOUND ON'
}

window.addEventListener('resize', () => game.resize())
$('version').textContent = `v${VERSION}`
$('play').addEventListener('click', () => playLevel())
$('back').addEventListener('click', () => {
  game.stop()
  show(menu)
  renderMenu()
  $('play').focus({ preventScroll: true })
})
$('pause').addEventListener('click', () => game.togglePause())
$('resume').addEventListener('click', () => game.togglePause())
$('restart').addEventListener('click', () => game.restart())
$('next-trail').addEventListener('click', () => playLevel(queuedNext))

for (const [id, action] of [['move-left', 'left'], ['move-right', 'right'], ['jump', 'jump']]) {
  const button = $(id)
  const release = event => {
    event.preventDefault()
    button.removeAttribute('data-held')
    game.setInput(action, false)
  }
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    try { button.setPointerCapture?.(event.pointerId) } catch {}
    button.setAttribute('data-held', '')
    game.setInput(action, true)
  })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
}

for (const button of document.querySelectorAll('.nav-item')) button.addEventListener('click', () => {
  audio.cue('tap')
  openTab(button.dataset.tab)
})
for (const look of ['garden', 'dusk']) $('look-' + look).addEventListener('click', () => store.setTheme(look))

$('sound-toggle').addEventListener('click', () => {
  audio.startFromGesture()
  const muted = audio.setMuted(!audio.isMuted())
  if (!muted) audio.cue('start')
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

$('howto-open').addEventListener('click', () => howto.showModal())
$('howto-close').addEventListener('click', () => howto.close())
$('about-open').addEventListener('click', () => $('about').showModal())
$('about-close').addEventListener('click', () => $('about').close())

$('friends').addEventListener('click', async event => {
  const button = event.currentTarget
  const original = button.textContent
  const result = await shareSeed(currentSeed(), 'Jumpit')
  if (result === 'copied') button.textContent = 'LINK COPIED'
  if (result === 'failed') button.textContent = 'COULD NOT SHARE'
  if (result === 'copied' || result === 'failed') {
    setTimeout(() => { button.textContent = original }, 2200)
  }
})

wireInstall($('install'), {
  showIosHint: () => {
    howto.querySelector('h2').textContent = 'Add to home screen'
    howto.querySelector('ol').innerHTML =
      '<li>Tap the <b>share</b> button at the bottom of Safari.</li>' +
      '<li>Scroll down and tap <b>Add to Home Screen</b>.</li>' +
      '<li>Tap <b>Add</b>. It opens like an app and works offline.</li>'
    howto.querySelector('.small').textContent = ''
    howto.showModal()
  },
})

renderMenu(save)
document.addEventListener('pointerdown', () => audio.startFromGesture(), { once: true })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause()
})
wireUpdate($('update'))
registerWorker()
