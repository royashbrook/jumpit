import { currentSeed, shareSeed } from './seed.js'
import { createGame } from './game.js'
import { wireInstall } from './install.js'
import { wireUpdate, registerWorker } from './update.js'
import { VERSION } from './version.js'

const $ = id => document.getElementById(id)
const menu = $('menu')
const gameScreen = $('game')
const howto = $('howto')
const game = createGame($('stage'))
window.addEventListener('resize', () => game.resize())

function show(screen) {
  for (const el of [menu, gameScreen]) el.hidden = el !== screen
}

function play() {
  show(gameScreen)
  game.start(currentSeed())
}

$('version').textContent = `v${VERSION}`
$('play').addEventListener('click', play)
$('back').addEventListener('click', () => {
  game.stop()
  show(menu)
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

wireUpdate($('update'))
registerWorker()
