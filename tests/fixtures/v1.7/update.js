// the update banner. an installed PWA will happily run a months-old shell forever,
// so the game has to notice for itself and offer the reload.
//
// the mechanism: the loaded VERSION came from this session's coherent cached shell.
// fetch version.js through `?update-probe` and compare the deployed VERSION to it.
// the worker passes that query straight to the network, so a client reopening after
// a deployment can detect the change instead of accepting the new html with old js.

import { VERSION } from './version.js'

const PROBE = './version.js?update-probe'
const EVERY = 5 * 60 * 1000
let reloadStarted = false

function reloadOnce() {
  if (reloadStarted) return false
  reloadStarted = true
  location.reload()
  return true
}

function versionFrom(source) {
  return source.match(/\bVERSION\s*=\s*(['"])([^'"]+)\1/)?.[2] || null
}

export function wireUpdate(banner, { onStatus } = {}) {
  if (!banner) return { check: async () => 'unknown' }

  const check = async () => {
    try {
      const response = await fetch(PROBE, { cache: 'no-store' })
      if (!response.ok) return 'unknown'
      const deployed = versionFrom(await response.text())
      if (!deployed) return 'unknown'
      const status = deployed === VERSION ? 'current' : 'stale'
      banner.hidden = status !== 'stale'
      return status
    } catch {
      return 'offline' // nothing to say, and nothing broken
    }
  }

  const announce = () => check().then(status => {
    onStatus?.(status)
    return status
  })

  banner.addEventListener('click', reloadOnce)
  void announce()
  setInterval(() => { void announce() }, EVERY)
  // coming back to the tab is the moment a player is most likely to accept a reload
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void announce()
  })

  return { check }
}

export function registerWorker(path = 'sw.js') {
  if (!('serviceWorker' in navigator)) return null
  // file:// has no worker scope, and a dev server on localhost is fine
  if (location.protocol === 'file:') return null

  const serviceWorker = navigator.serviceWorker
  const hadController = Boolean(serviceWorker.controller)
  serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadOnce()
  })

  const start = () => serviceWorker.register(path).then(registration => {
    const refresh = () => registration.update().catch(() => {})
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
