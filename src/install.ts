interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: string; platform?: string }>
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function wireInstall(button: HTMLButtonElement | null, { showIosHint }: { showIosHint?: () => void } = {}) {
  if (!button) return { dispose() {} }
  button.hidden = true
  if (isInstalled()) return { dispose() {} }
  const ios = isIos()
  let deferred: InstallPromptEvent | null = null
  let disposed = false
  const beforeInstall = (event: Event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    button.hidden = false
  }
  const click = async () => {
    if (deferred) {
      const prompt = deferred
      deferred = null
      button.disabled = true
      try { await prompt.prompt(); await prompt.userChoice }
      catch { /* Native prompts are spent even when cancelled or unavailable. */ }
      finally {
        if (!disposed) {
          button.disabled = false
          if (!deferred) button.hidden = true
        }
      }
      return
    }
    if (ios && typeof showIosHint === 'function') showIosHint()
    else button.hidden = true
  }
  const installed = () => {
    deferred = null
    button.disabled = false
    button.hidden = true
  }
  window.addEventListener('beforeinstallprompt', beforeInstall)
  button.addEventListener('click', click)
  window.addEventListener('appinstalled', installed)
  if (ios && typeof showIosHint === 'function') button.hidden = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      deferred = null
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      button.removeEventListener('click', click)
      window.removeEventListener('appinstalled', installed)
    },
  }
}
