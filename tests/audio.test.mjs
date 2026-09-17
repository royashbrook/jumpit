import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudio } from '../src/audio.ts'

function fakeContext() {
  const starts = []
  const calls = []
  const buffers = []
  const sources = []
  const gains = []
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} })
  return {
    state: 'suspended',
    currentTime: 2,
    sampleRate: 8_000,
    destination: {},
    starts,
    calls,
    buffers,
    sources,
    gains,
    resume() { calls.push('resume'); this.state = 'running' },
    suspend() { calls.push('suspend'); this.state = 'suspended' },
    close() { calls.push('close'); this.state = 'closed' },
    createGain: () => {
      const gain = { gain: parameter(), connect() {} }
      gains.push(gain)
      return gain
    },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length)
      const buffer = { channels, length, sampleRate, getChannelData: () => data }
      buffers.push(buffer)
      return buffer
    },
    createBufferSource() {
      const source = {
        buffer: null, loop: false,
        connect() {},
        start(at) { starts.push(at) },
        stop() { this.stopped = true },
      }
      sources.push(source)
      return source
    },
    createOscillator: () => ({
      type: '', frequency: parameter(), connect() {},
      start(at) { starts.push(at) }, stop() {},
    }),
  }
}

test('audio starts only from the explicit gesture path and schedules an original cue', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  assert.equal(audio.cue('jump'), false)
  assert.equal(await audio.startFromGesture(), true)
  assert.equal(context.state, 'running')
  assert.equal(audio.cue('jump'), true)
  assert.equal(context.starts.length, 2)
})

test('one original looping adventure bed follows play, pause, and suspension', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  assert.equal(audio.setMusicPlaying(true), false)
  assert.equal(context.sources.length, 0)

  await audio.startFromGesture()
  assert.equal(context.sources.length, 1)
  assert.equal(context.sources[0].loop, true)
  assert.equal(context.starts.length, 1)
  assert.equal(context.buffers[0].channels, 1)
  assert.equal(context.buffers[0].getChannelData(0).some(sample => sample !== 0), true)
  assert.ok(Math.abs(context.buffers[0].getChannelData(0).at(-1)) < .0001)

  assert.equal(audio.setMusicPlaying(true), true)
  assert.equal(context.sources.length, 1)
  assert.equal(context.gains[1].gain.value, .2)
  assert.equal(audio.setMusicPlaying(false), false)
  assert.equal(context.gains[1].gain.value, 0)
  audio.setMusicPlaying(true)
  await audio.suspend()
  await audio.startFromGesture()
  assert.equal(context.sources.length, 1)
})

test('muting is persistent, immediate, and safe before audio exists', async () => {
  const writes = []
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context, readMuted: () => true, writeMuted: value => writes.push(value) })
  assert.equal(audio.isMuted(), true)
  assert.equal(await audio.startFromGesture(), true)
  assert.equal(audio.cue('seed'), false)
  assert.equal(audio.setMuted(false), false)
  assert.equal(context.gains[0].gain.value, .72)
  assert.equal(audio.cue('seed'), true)
  audio.setMusicPlaying(true)
  assert.equal(audio.setMuted(true), true)
  assert.equal(context.gains[0].gain.value, 0)
  assert.deepEqual(writes, [false, true])
})

test('the guardian fight has distinct hit, locked, and victory cues', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  await audio.startFromGesture()
  assert.equal(audio.cue('guardian-hit'), true)
  assert.equal(audio.cue('guardian-locked'), true)
  assert.equal(audio.cue('guardian-defeated'), true)
  assert.equal(context.starts.length, 8)
})

test('a hidden light has its own three-note discovery cue', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  await audio.startFromGesture()
  assert.equal(audio.cue('hidden-light'), true)
  assert.equal(context.starts.length, 3)
})

test('background suspension silences queued cues until a fresh gesture resumes audio', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  await audio.startFromGesture()
  assert.equal(audio.cue('jump'), true)
  assert.equal(await audio.suspend(), true)
  assert.equal(context.state, 'suspended')
  assert.equal(audio.cue('seed'), false)
  assert.equal('resume' in audio, false)
  assert.equal(await audio.startFromGesture(), true)
  assert.equal(audio.cue('seed'), true)
  assert.deepEqual(context.calls, ['resume', 'suspend', 'resume'])
})

test('an immediate gesture waits for an in-flight background suspension before resuming', async () => {
  const context = fakeContext()
  context.suspend = async function () {
    this.calls.push('suspend')
    await new Promise(resolve => setTimeout(resolve, 0))
    this.state = 'suspended'
  }
  const audio = createAudio({ contextFactory: () => context })
  await audio.startFromGesture()
  const hiding = audio.suspend()
  const waking = audio.startFromGesture()
  await Promise.all([hiding, waking])
  assert.equal(context.state, 'running')
  assert.deepEqual(context.calls, ['resume', 'suspend', 'resume'])
})

test('disposing audio before a gesture never creates a context or writes preferences', async () => {
  let created = 0
  const writes = []
  const audio = createAudio({
    contextFactory: () => { created += 1; return fakeContext() },
    writeMuted: value => writes.push(value),
  })
  await audio.dispose()
  assert.equal(await audio.startFromGesture(), false)
  assert.equal(await audio.suspend(), false)
  assert.equal(audio.cue('jump'), false)
  assert.equal(audio.setMusicPlaying(true), false)
  assert.equal(audio.setMuted(true), false)
  assert.equal(created, 0)
  assert.deepEqual(writes, [])
})

test('audio disposal silences the mix, stops its loop, and closes only once', async () => {
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context })
  audio.setMusicPlaying(true)
  await audio.startFromGesture()
  assert.equal(audio.cue('jump'), true)
  const starts = context.starts.length
  await audio.dispose()
  await audio.dispose()
  await audio.stop()
  assert.equal(context.sources[0].stopped, true)
  assert.deepEqual(context.gains.map(gain => gain.gain.value), [0, 0, 0, 0])
  assert.deepEqual(context.calls, ['resume', 'close'])
  assert.equal(await audio.startFromGesture(), false)
  assert.equal(audio.cue('seed'), false)
  assert.equal(audio.setMusicPlaying(true), false)
  assert.equal(context.starts.length, starts)
})

test('disposing during background suspension prevents the queued gesture from resuming', async () => {
  const context = fakeContext()
  let finishSuspend
  context.suspend = function () {
    this.calls.push('suspend')
    return new Promise(resolve => { finishSuspend = () => { this.state = 'suspended'; resolve() } })
  }
  const audio = createAudio({ contextFactory: () => context })
  await audio.startFromGesture()
  const hiding = audio.suspend()
  const waking = audio.startFromGesture()
  await audio.dispose()
  finishSuspend()
  assert.deepEqual(await Promise.all([hiding, waking]), [false, false])
  assert.deepEqual(context.calls, ['resume', 'suspend', 'close'])
  assert.equal(context.sources.length, 0)
})

test('disposing during resume prevents late audio work and contains a failed close', async () => {
  const context = fakeContext()
  let finishResume
  context.resume = function () {
    this.calls.push('resume')
    return new Promise(resolve => { finishResume = () => { this.state = 'running'; resolve() } })
  }
  context.close = function () {
    this.calls.push('close')
    return Promise.reject(new Error('audio device unavailable'))
  }
  const audio = createAudio({ contextFactory: () => context })
  audio.setMusicPlaying(true)
  const waking = audio.startFromGesture()
  await audio.dispose()
  finishResume()
  assert.equal(await waking, false)
  assert.equal(audio.cue('seed'), false)
  assert.equal(context.sources.length, 0)
  assert.deepEqual(context.gains.map(gain => gain.gain.value), [0, 0])
  assert.deepEqual(context.calls, ['resume', 'close'])
})
