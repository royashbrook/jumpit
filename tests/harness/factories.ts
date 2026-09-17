import type { createGame, Game } from '../../src/game.ts'
import type { createAudio } from '../../src/audio.ts'

const inactiveState = {
  respawning: false, hiddenLightId: null,
  guardianHealth: 0, guardianMax: 0, guardianDefeated: true,
}

export const endingGame: typeof createGame = (_canvas, onState = () => {}, onCue = () => {}) => {
  let levelId = 'garden-1'
  let health = 3
  let finished = false
  let paused = false
  const report = (message: string) => onState({
    ...inactiveState,
    levelId,
    levelName: levelId === 'keep-4' ? 'The Waking Beacon' : 'Dewdrop Dash',
    regionName: levelId === 'keep-4' ? 'Beacon Keep' : 'Garden Walk',
    seeds: levelId === 'keep-4' ? 5 : 0,
    maxSeeds: levelId === 'keep-4' ? 5 : 4,
    paused, finished, message,
    ...(levelId === 'keep-4' ? { guardianHealth: health, guardianMax: 3, guardianDefeated: health === 0 } : {}),
  })
  const start = (id = 'garden-1') => {
    levelId = id
    health = 3
    finished = false
    paused = false
    report(levelId === 'keep-4' ? 'THE WARDEN GUARDS THE BELL' : '')
  }
  return {
    start,
    restart() { start(levelId) },
    stop() {}, destroy() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (!value || levelId !== 'keep-4' || finished) return
      if (action === 'jump' && health > 0) {
        health -= 1
        onCue(health ? 'guardian-hit' : 'guardian-defeated')
        report(health ? 'THE WARDEN SHAKES' : 'THE BELL IS FREE')
      } else if (action === 'right' && health === 0) {
        finished = true
        onCue('finish')
        report('THE BEACON IS AWAKE')
      }
    },
    togglePause() { paused = !paused; report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() { paused = true; report('PAUSED'); return paused },
  }
}

export const inputGame: typeof createGame = (_canvas, onState = () => {}) => {
  const setInput: Game['setInput'] = (action, value) => {
    const events: string[] = JSON.parse(document.documentElement.dataset.inputEvents || '[]')
    events.push(action + ':' + value)
    document.documentElement.dataset.inputEvents = JSON.stringify(events)
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.code !== 'Space') return
    setInput('jump', event.type === 'keydown')
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  const report = (paused = false) => onState({
    ...inactiveState,
    levelId: 'garden-1', levelName: 'Dewdrop Dash', regionName: 'Garden Walk',
    seeds: 0, maxSeeds: 3, paused, finished: false, message: '',
  })
  return {
    start() { report(false) }, restart() { report(false) }, stop() {}, resize() {}, setInput,
    destroy() {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    },
    clearInput() { setInput('left', false); setInput('right', false); setInput('jump', false) },
    togglePause() { report(true); return true }, pause() { report(true); return true },
  }
}

export const feedbackGame: typeof createGame = (_canvas, onState = () => {}) => {
  let levelId = 'garden-1'
  let finished = false
  let paused = false
  const report = (message: string) => onState({
    ...inactiveState,
    levelId,
    levelName: levelId === 'garden-4' ? 'Bramble Bank' : 'Dewdrop Dash',
    regionName: 'Garden Walk',
    seeds: 1, maxSeeds: levelId === 'garden-4' ? 4 : 3,
    paused, finished, message,
  })
  const start = (id = 'garden-1') => {
    levelId = id
    finished = false
    paused = false
    report('')
  }
  return {
    start,
    restart() { start(levelId) },
    stop() {}, destroy() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (!value || action !== 'right' || finished) return
      if (levelId === 'garden-4') finished = true
      report(finished ? 'TRAIL CLEARED!' : 'LANTERN SEED!')
    },
    togglePause() { paused = !paused; report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() { paused = true; report('PAUSED'); return paused },
  }
}

export const hiddenLightGame: typeof createGame = (_canvas, onState = () => {}, onCue = () => {}) => {
  let levelId = 'garden-3'
  let found = false
  const report = (message: string) => onState({
    ...inactiveState,
    levelId, levelName: 'Sunleaf Rise', regionName: 'Garden Walk',
    seeds: 0, maxSeeds: 4, paused: false, finished: false, message,
    hiddenLightId: found ? 'g03-hidden-light' : null,
  })
  const start: Game['start'] = (id = 'garden-3', options = {}) => {
    levelId = id
    found = Boolean(options.foundHiddenLights?.includes('g03-hidden-light'))
    report('')
  }
  return {
    start, restart() { start(levelId) }, stop() {}, destroy() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (!value || action !== 'jump' || found) return
      found = true
      onCue('hidden-light')
      report('HIDDEN LIGHT FOUND!')
    },
    togglePause() { return false }, pause() { return false },
  }
}

export const lifecycleGame: typeof createGame = (_canvas, onState = () => {}, onCue = () => {}) => {
  let finished = false
  let paused = false
  const report = (message: string) => {
    document.documentElement.dataset.lifecycleGameState = finished ? 'finished' : paused ? 'paused' : 'running'
    onState({
      ...inactiveState,
      levelId: 'garden-1', levelName: 'Dewdrop Dash', regionName: 'Garden Walk',
      seeds: document.documentElement.dataset.perfectFinish === 'armed' ? 99 : 0,
      maxSeeds: document.documentElement.dataset.perfectFinish === 'armed' ? 99 : 3,
      paused, finished, message,
    })
  }
  const start = () => { finished = false; paused = false; report('') }
  return {
    start, restart: start, stop() {}, destroy() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (document.documentElement.dataset.finishOnRight !== 'armed' || action !== 'right' || !value || finished) return
      finished = true
      onCue('finish')
      report('TRAIL CLEARED!')
    },
    togglePause() { paused = !paused; onCue('pause'); report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() {
      if (paused || finished) return paused
      paused = true
      onCue('pause')
      report('PAUSED')
      return paused
    },
  }
}

export const lifecycleAudio: typeof createAudio = () => {
  const mark = (value: string) => { document.documentElement.dataset.audioState = value }
  const markMusic = (value: boolean) => { document.documentElement.dataset.musicState = value ? 'playing' : 'paused' }
  return {
    startFromGesture() { mark('running'); return Promise.resolve(true) },
    suspend() { mark('suspended'); return Promise.resolve(true) },
    cue(name) {
      const cues: string[] = JSON.parse(document.documentElement.dataset.audioCues || '[]')
      cues.push(name)
      document.documentElement.dataset.audioCues = JSON.stringify(cues)
      return true
    },
    setMusicPlaying(value) { markMusic(value); return value },
    setMuted(value) { return value }, isMuted() { return false }, stop() {}, dispose() {},
  }
}
