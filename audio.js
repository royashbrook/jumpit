const CUES = Object.freeze({
  tap: [[0, 0, .045, .05, 'square']],
  start: [[0, 0, .07, .06], [7, .07, .1, .06]],
  jump: [[0, 0, .06, .055], [5, .045, .08, .05]],
  seed: [[7, 0, .07, .06], [12, .065, .12, .07]],
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

const frequency = semitones => 440 * 2 ** ((semitones - 9) / 12)

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
      }
      if (context.state === 'closed') return false
      if (context.state !== 'running') await context.resume()
      gestureRequired = context.state !== 'running'
      return !gestureRequired
    } catch {
      return false
    }
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
    return context?.close?.()
  }

  return {
    startFromGesture,
    cue,
    setMuted,
    isMuted: () => muted,
    suspend,
    stop,
  }
}
