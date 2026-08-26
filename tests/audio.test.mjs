import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudio } from '../audio.js'

function fakeContext() {
  const starts = []
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} })
  return {
    state: 'suspended',
    currentTime: 2,
    destination: {},
    starts,
    resume() { this.state = 'running' },
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
