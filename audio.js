const CUES = Object.freeze({
  tap: [[0, 0, .045, .05, 'square']],
  start: [[0, 0, .07, .06], [7, .07, .1, .06]],
  jump: [[0, 0, .06, .055], [5, .045, .08, .05]],
  seed: [[7, 0, .07, .06], [12, .065, .12, .07]],
  'hidden-light': [[0, 0, .09, .055], [7, .08, .12, .065], [14, .2, .2, .075]],
  stomp: [[-5, 0, .09, .075, 'square'], [0, .055, .08, .05]],
  power: [[0, 0, .1, .06], [4, .08, .1, .06], [7, .16, .16, .07]],
  checkpoint: [[0, 0, .09, .06], [7, .09, .18, .07]],
  'guardian-hit': [[-7, 0, .09, .07, 'square'], [2, .07, .12, .06]],
  'guardian-defeated': [[0, 0, .11, .07], [4, .09, .11, .07], [7, .18, .12, .07], [12, .29, .24, .08]],
  'guardian-locked': [[-12, 0, .12, .055, 'square'], [-12, .1, .12, .045, 'square']],
  hurt: [[0, 0, .08, .065, 'sawtooth'], [-7, .07, .14, .055, 'sawtooth']],
  pause: [[0, 0, .08, .045], [-5, .06, .1, .04]],
  finish: [[0, 0, .11, .07], [4, .1, .11, .07], [7, .2, .11, .07], [12, .31, .28, .08]],
})

// Original 6/8 woodland motif: eight short phrases, written for Jumpit.
const MUSIC_NOTES = Object.freeze([
  7, 9, 12, 9, 7, 4,
  4, 7, 9, 12, 9, 7,
  5, 9, 12, 9, 5, 4,
  7, 11, 14, 11, 7, 2,
  4, 7, 12, 14, 12, 7,
  2, 5, 9, 12, 9, 5,
  5, 9, 14, 12, 11, 7,
  4, 7, 12, 9, 7, 0,
])
const MUSIC_ROOTS = Object.freeze([0, -3, -5, -5, -8, -10, -5, 0])
const MUSIC_STEP = .255
const MUSIC_VOLUME = .2

const frequency = semitones => 440 * 2 ** ((semitones - 9) / 12)

export function createMusicBuffer(context) {
  const sampleRate = context.sampleRate || 44_100
  const buffer = context.createBuffer(1, Math.ceil((MUSIC_NOTES.length * MUSIC_STEP + .42) * sampleRate), sampleRate)
  const channel = buffer.getChannelData(0)

  const pluck = (note, start, duration, volume, color = .18) => {
    const first = Math.floor(start * sampleRate)
    const count = Math.min(channel.length - first, Math.floor(duration * sampleRate))
    const pitch = frequency(note)
    for (let index = 0; index < count; index += 1) {
      const time = index / sampleRate
      const fade = Math.min(1, time / .015) * (1 - time / duration) ** 2
      const phase = Math.PI * 2 * pitch * time
      channel[first + index] += (Math.sin(phase) + Math.sin(phase * 2) * color) * fade * volume
    }
  }

  MUSIC_NOTES.forEach((note, index) => pluck(note, index * MUSIC_STEP, .42, .055))
  MUSIC_ROOTS.forEach((root, bar) => {
    const start = bar * 6 * MUSIC_STEP
    pluck(root - 12, start, 1.25, .05, .08)
    pluck(root - 5, start + 3 * MUSIC_STEP, .7, .026, .06)
  })
  return buffer
}

export function createAudio({
  contextFactory = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
    return AudioContext ? new AudioContext() : null
  },
  readMuted = () => false,
  writeMuted = () => {},
} = {}) {
  let context = null
  let master = null
  let musicGain = null
  let musicSource = null
  let musicPlaying = false
  let muted = Boolean(readMuted())
  let gestureRequired = true
  let pendingSuspend = null

  async function startFromGesture() {
    try {
      if (pendingSuspend) await pendingSuspend
      if (!context) {
        context = contextFactory()
        if (!context) return false
        master = context.createGain()
        master.gain.value = muted ? 0 : .72
        master.connect(context.destination)
        musicGain = context.createGain()
        musicGain.gain.value = 0
        musicGain.connect(master)
      }
      if (context.state === 'closed') return false
      if (context.state !== 'running') await context.resume()
      gestureRequired = context.state !== 'running'
      syncMusic()
      return !gestureRequired
    } catch {
      return false
    }
  }

  function syncMusic() {
    const audible = Boolean(musicPlaying && context && musicGain && !gestureRequired && context.state === 'running')
    if (musicGain) musicGain.gain.value = audible ? MUSIC_VOLUME : 0
    if (!audible || musicSource) return audible
    try {
      musicSource = context.createBufferSource()
      musicSource.buffer = createMusicBuffer(context)
      musicSource.loop = true
      musicSource.connect(musicGain)
      musicSource.start()
      return true
    } catch {
      musicSource = null
      musicGain.gain.value = 0
      return false
    }
  }

  function setMusicPlaying(value) {
    musicPlaying = Boolean(value)
    return syncMusic()
  }

  function cue(name) {
    if (!context || !master || muted || gestureRequired || context.state !== 'running' || !CUES[name]) return false
    const origin = context.currentTime
    for (const [note, delay, duration, volume, wave = 'sine'] of CUES[name]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = origin + delay
      oscillator.type = wave
      oscillator.frequency.setValueAtTime(frequency(note), start)
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start)
      oscillator.stop(start + duration + .02)
    }
    return true
  }

  function setMuted(value) {
    muted = Boolean(value)
    if (master) master.gain.value = muted ? 0 : .72
    try { writeMuted(muted) } catch {}
    return muted
  }

  async function suspend() {
    gestureRequired = true
    try {
      if (!pendingSuspend && context?.state === 'running') {
        pendingSuspend = Promise.resolve(context.suspend()).finally(() => { pendingSuspend = null })
      }
      if (pendingSuspend) await pendingSuspend
      return true
    } catch {
      return false
    }
  }

  function stop() {
    gestureRequired = true
    musicPlaying = false
    try { musicSource?.stop() } catch {}
    musicSource = null
    return context?.close?.()
  }

  return {
    startFromGesture,
    cue,
    setMusicPlaying,
    setMuted,
    isMuted: () => muted,
    suspend,
    stop,
  }
}
