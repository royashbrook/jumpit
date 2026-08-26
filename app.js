import { currentSeed, shareSeed } from './seed.js'
import { createGame } from './game.js'
import { wireInstall } from './install.js'
import { wireUpdate, registerWorker } from './update.js'
import { VERSION } from './version.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const gameScreen = $('game')
const howto = $('howto')
const game = createGame($('stage'), state => {
  $('level-name').textContent = state.levelName.toUpperCase()
  $('seed-count').textContent = `◆ ${state.seeds}/${state.maxSeeds}`
  $('pause').textContent = state.paused ? '▶' : 'Ⅱ'
  $('pause').setAttribute('aria-label', state.paused ? 'resume game' : 'pause game')
  $('game-status').textContent = state.message
})
window.addEventListener('resize', () => game.resize())

function show(screen) {
  for (const el of [menu, gameScreen]) el.hidden = el !== screen
}

function play() {
  show(gameScreen)
  game.start('garden-1', currentSeed())
}

$('version').textContent = `v${VERSION}`
$('play').addEventListener('click', play)
$('back').addEventListener('click', () => {
  game.stop()
  show(menu)
})
$('pause').addEventListener('click', () => game.togglePause())

for (const [id, action] of [['move-left', 'left'], ['move-right', 'right'], ['jump', 'jump']]) {
  const button = $(id)
  const release = event => {
    event.preventDefault()
    button.removeAttribute('data-held')
    game.setInput(action, false)
  }
  button.addEventListener('pointerdown', event => {
    event.preventDefault()
    button.setPointerCapture?.(event.pointerId)
    button.setAttribute('data-held', '')
    game.setInput(action, true)
  })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
}
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

wireUpdate($('update'))
registerWorker()
