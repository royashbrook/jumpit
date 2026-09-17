import { GENERATION } from './version.ts'
export { GENERATION }

const EVERY = 5 * 60 * 1000

export function wireUpdate(banner: HTMLButtonElement | null) {
  let available = false
  let disposed = false
  let reloadStarted = false
  const click = () => {
    if (!available || disposed || reloadStarted) return
    reloadStarted = true
    location.reload()
  }
  banner?.addEventListener('click', click)
  return {
    reveal() {
      if (!banner || disposed) return false
      available = true
      banner.hidden = false
      return true
    },
    dispose() {
      disposed = true
      banner?.removeEventListener('click', click)
    },
  }
}

export function registerWorker(path = 'sw.js', revealUpdate: () => unknown = () => {}) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return null
  const serviceWorker = navigator.serviceWorker
  let disposed = false
  let hadController = Boolean(serviceWorker.controller)
  let interval: ReturnType<typeof setInterval> | undefined
  let registration: ServiceWorkerRegistration | null = null
  const channels = new Set<() => void>()
  let startupProbe: AbortController | null = null

  const confirmStartupGeneration = async (generation: string, controller: ServiceWorker) => {
    // An old network-first worker can deliver a NEW page before its worker updates.
    // A different startup controller alone therefore says nothing about which is newer.
    const abort = new AbortController()
    startupProbe?.abort()
    startupProbe = abort
    const timeout = setTimeout(() => abort.abort(), 8_000)
    try {
      const url = new URL('version.json?update-probe', new URL(path, location.href))
      const response = await fetch(url, { cache: 'no-store', signal: abort.signal })
      if (!response.ok) return
      const identity: unknown = await response.json()
      if (!disposed && !abort.signal.aborted && controller === serviceWorker.controller &&
        identity && typeof identity === 'object' && 'build' in identity &&
        typeof identity.build === 'string' && generation === `jumpit-${identity.build}`) revealUpdate()
    } catch {
      // Offline startup stays playable. The controller-change listener still handles updates.
    } finally {
      clearTimeout(timeout)
      if (startupProbe === abort) startupProbe = null
    }
  }

  const readGeneration = (controller: ServiceWorker | null, notify: boolean, startup = false) => {
    if (!controller || disposed || typeof MessageChannel === 'undefined') return
    const channel = new MessageChannel()
    const close = () => {
      clearTimeout(timeout)
      channel.port1.close()
      channel.port2.close()
      channels.delete(close)
    }
    // A dead worker must not leave a port alive for the lifetime of the app.
    const timeout = setTimeout(close, 5_000)
    channels.add(close)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      close()
      if (disposed || typeof event.data !== 'string') return
      if (event.data === GENERATION) {
        controller.postMessage({ type: 'CLIENT_GENERATION', generation: GENERATION })
      } else if (event.data && notify) {
        if (startup) void confirmStartupGeneration(event.data, controller)
        else revealUpdate()
      }
    }
    try {
      controller.postMessage('jumpit:generation', [channel.port2])
    } catch {
      close()
    }
  }
  const changed = () => {
    readGeneration(serviceWorker.controller, hadController)
    hadController = true
  }
  const refresh = () => registration?.update().catch(() => {})
  const visible = () => { if (!document.hidden && !disposed) void refresh() }
  serviceWorker.addEventListener('controllerchange', changed)

  let settle: (registration: ServiceWorkerRegistration | null) => void
  const ready = new Promise<ServiceWorkerRegistration | null>(resolve => { settle = resolve })
  const start = () => {
    if (disposed) return
    void serviceWorker.register(path).then(value => {
      if (disposed) return settle(null)
      registration = value
      void refresh()
      interval = setInterval(refresh, EVERY)
      document.addEventListener('visibilitychange', visible)
      readGeneration(serviceWorker.controller, hadController, true)
      settle(value)
    }).catch(() => settle(null)) // offline registration failure must not prevent play
  }
  if (document.readyState === 'complete') start()
  else addEventListener('load', start, { once: true })

  return {
    ready,
    dispose() {
      disposed = true
      startupProbe?.abort()
      clearInterval(interval)
      removeEventListener('load', start)
      document.removeEventListener('visibilitychange', visible)
      serviceWorker.removeEventListener('controllerchange', changed)
      for (const close of channels) close()
      settle(null)
    },
  }
}
