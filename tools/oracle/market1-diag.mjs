// Reference-only diagnostic. Print the divergent trail's numeric state and exact sine arguments
// every frame. This does not compare, round or change the acceptance gate.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const checkout = resolve(process.argv[2])
const REFERENCE = '25abd61230184517c85a7b5f381ad25988c81989'
const bits = x => {
  const d = new DataView(new ArrayBuffer(8))
  d.setFloat64(0, x)
  return Array.from(new Uint8Array(d.buffer), b => b.toString(16).padStart(2, '0')).join('')
}
const dir = mkdtempSync(join(tmpdir(), 'oracle-m1-'))
try {
  const ref = join(dir, 'ref')
  execFileSync('git', ['-C', checkout, 'worktree', 'add', '--detach', ref, REFERENCE], { stdio: 'pipe' })
  const url = p => pathToFileURL(join(ref, p.split('?')[0])).href + (p.includes('?') ? '?' + p.split('?')[1] : '')
  const sim = await import(url('engine/simulation.js?v=3'))
  const solv = await import(url('engine/solvability.js'))
  const L = await import(url('levels.js?v=2'))
  const level = L.LEVELS.find(l => l.id === 'market-1')
  const recorded = solv.recordReplay(level)
  const s = sim.createSimulation(level)
  const kinds = s.world.enemies.map(e => `${e.id}:${e.kind}:home=${bits(e.home)}`).join(' ')
  const lifts = s.world.terrain.filter(r => r.kind === 'lift').map(r => `${r.id}:phase=${bits(r.phase)}`).join(' ')
  console.log(`m1 platform ${process.platform} ${process.arch} node ${process.version}`)
  console.log(`m1 inputs ${recorded.inputs.length} hash ${recorded.hash} frames ${recorded.frames}`)
  console.log(`m1 enemies ${kinds}`)
  console.log(`m1 lifts ${lifts || 'none'}`)
  for (const v of recorded.inputs) {
    const frame = s.frame
    const events = sim.stepSimulation(s, { left: Boolean(v & 1), right: Boolean(v & 2), jumpPressed: Boolean(v & 4) })
    const p = s.player
    const player = [p.x, p.y, p.vx, p.vy, p.coyote, p.jumpBuffer, p.sparkFrames].map(bits).join(',') + (p.onGround ? 'G' : 'A')
    const enemies = s.world.enemies.map(e => [e.x, e.y, e.vx].map(bits).join(',') + (e.alive ? '' : 'x') + e.invulnerable).join(';')
    const moving = s.world.terrain.filter(r => r.kind === 'lift' || r.kind === 'crumble').map(r => bits(r.y) + (r.active ? '' : 'o') + r.timer).join(';')
    const sines = s.world.enemies.filter(e => e.kind === 'mothlight').map(e => bits(Math.sin(frame * 0.08 + e.home))).join(',')
    console.log(`m1f ${frame} ${player} | ${enemies} | ${moving} | ${sines} | ${events.map(e => e.type).join(',')}`)
    if (s.finished) break
  }
} finally {
  try { execFileSync('git', ['-C', checkout, 'worktree', 'remove', '--force', join(dir, 'ref')], { stdio: 'pipe' }) } catch {}
  rmSync(dir, { recursive: true, force: true })
}
