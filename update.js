// An update becomes actionable only after its complete cache has activated. The
// replacement worker reports its generation; a page already running that exact
// generation needs no redundant reload.
const EVERY = 5 * 60 * 1000
let reloadStarted = false
export const GENERATION = 'jumpit-v2.0.0-r20'

function reloadOnce() {
  if (reloadStarted) return false
  reloadStarted = true
  location.reload()
  return true
}

export function wireUpdate(banner) {
  if (!banner) return { reveal: () => false }

  let available = false
  const reveal = () => {
    available = true
    banner.hidden = false
    return true
  }

  banner.addEventListener('click', () => {
    if (available) reloadOnce()
  })

  return { reveal }
}

function readGeneration(controller, receive) {
  if (!controller || typeof MessageChannel === 'undefined') return false
  try {
    const channel = new MessageChannel()
    channel.port1.onmessage = event => receive(event.data)
    controller.postMessage('jumpit:generation', [channel.port2])
    return true
  } catch {
    return false
  }
}

export function registerWorker(path = 'sw.js', revealUpdate = () => {}) {
  if (!('serviceWorker' in navigator)) return null
  // file:// has no worker scope, and a dev server on localhost is fine
  if (location.protocol === 'file:') return null

  const serviceWorker = navigator.serviceWorker
  let hadController = Boolean(serviceWorker.controller)
  serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      readGeneration(serviceWorker.controller, generation => {
        if (generation && generation !== GENERATION) revealUpdate()
      })
    }
    hadController = true
  })

  const start = () => serviceWorker.register(path).then(registration => {
    const refresh = () => registration.update().catch(() => {})
    void refresh()
    setInterval(refresh, EVERY)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void refresh()
    })
    return registration
  }).catch(() => {
    // an unregistered worker costs offline play, not the game. never block boot on it.
    return null
  })

  if (document.readyState === 'complete') return start()
  addEventListener('load', () => { void start() }, { once: true })
  return null
}
