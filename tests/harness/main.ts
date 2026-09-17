import { mount, unmount } from 'svelte'
import App from '../../src/App.svelte'
import '../../src/app.css'
import { createGame } from '../../src/game.ts'
import { createAudio } from '../../src/audio.ts'
import { endingGame, inputGame, feedbackGame, hiddenLightGame, lifecycleGame, lifecycleAudio } from './factories.ts'

// This entry is built separately and is never reachable from the production entry.
const query = new URLSearchParams(location.search)
const gameName = query.get('game') ?? 'real'
const audioName = query.get('audio') ?? 'real'
const games = new Map<string, typeof createGame>([
  ['real', createGame], ['ending', endingGame], ['input', inputGame],
  ['feedback', feedbackGame], ['hidden-light', hiddenLightGame], ['lifecycle', lifecycleGame],
])
const audios = new Map<string, typeof createAudio>([['real', createAudio], ['lifecycle', lifecycleAudio]])
const gameFactory = games.get(gameName)
const audioFactory = audios.get(audioName)
if (!gameFactory || !audioFactory) throw new Error('Unknown shell test fixture')
const count = (key: string) => {
  document.documentElement.dataset[key] = String(Number(document.documentElement.dataset[key] ?? 0) + 1)
}
const props = {
  gameFactory: (...args: Parameters<typeof createGame>) => {
    const game = gameFactory(...args)
    document.documentElement.dataset.harnessGame = gameName
    count('harnessGameCalls')
    return {
      ...game,
      start(...startArgs: Parameters<typeof game.start>) { count('harnessGameStarts'); game.start(...startArgs) },
      destroy() { game.destroy(); count('harnessGameDestroyed') },
    }
  },
  audioFactory: (...args: Parameters<typeof createAudio>) => {
    const audio = audioFactory(...args)
    document.documentElement.dataset.harnessAudio = audioName
    count('harnessAudioCalls')
    return { ...audio, dispose() { count('harnessAudioDisposed'); return audio.dispose() } }
  },
}
let app: ReturnType<typeof mount> | null = null
function mountApp() {
  if (app) throw new Error('Shell test app is already mounted')
  const target = document.getElementById('app')
  if (!target) throw new Error('Missing shell test mount')
  app = mount(App, { target, props })
}
async function unmountApp() {
  if (!app) return
  const current = app
  app = null
  await unmount(current)
}
declare global {
  interface Window {
    jumpitHarness: { mount: typeof mountApp; unmount: typeof unmountApp }
  }
}
window.jumpitHarness = { mount: mountApp, unmount: unmountApp }
mountApp()
