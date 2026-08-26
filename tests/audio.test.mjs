import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudio } from '../audio.js'

function fakeContext() {
  const starts = []
  const calls = []
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} })
  return {
    state: 'suspended',
    currentTime: 2,
    destination: {},
    starts,
    calls,
    resume() { calls.push('resume'); this.state = 'running' },
    suspend() { calls.push('suspend'); this.state = 'suspended' },
    close() { calls.push('close'); this.state = 'closed' },
    createGain: () => ({ gain: parameter(), connect() {} }),
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

test('muting is persistent, immediate, and safe before audio exists', async () => {
  const writes = []
  const context = fakeContext()
  const audio = createAudio({ contextFactory: () => context, readMuted: () => true, writeMuted: value => writes.push(value) })
  assert.equal(audio.isMuted(), true)
  assert.equal(await audio.startFromGesture(), true)
  assert.equal(audio.cue('seed'), false)
  assert.equal(audio.setMuted(false), false)
  assert.equal(audio.cue('seed'), true)
  assert.deepEqual(writes, [false])
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
