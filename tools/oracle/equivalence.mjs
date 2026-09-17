// Reproduce the evidence that the single-site one-way tolerance mutant is equivalent: a randomized
// differential search of the reference physics against the mutated copy, half the trials placed
// on the tolerance band. Any differing step fails. The both-sites mutant is scored in mutants.json.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withReference } from './reference.mjs'

const TRIALS = Number(process.argv[2] || 400000)
const differing = await withReference(async ref => {
  const dir = mkdtempSync(join(tmpdir(), 'jumpit-oracle-eq-'))
  try {
    const source = readFileSync(join(ref, 'engine/physics.js'), 'utf8')
    const from = 'previousBottom <= rect.y + 1 &&'
    if (source.split(from).length - 1 !== 1) throw new Error('equivalence anchor did not match exactly once')
    writeFileSync(join(dir, 'original.mjs'), source)
    writeFileSync(join(dir, 'mutant.mjs'), source.replace(from, 'previousBottom <= rect.y + 2 &&'))
    const O = await import(pathToFileURL(join(dir, 'original.mjs')).href)
    const M = await import(pathToFileURL(join(dir, 'mutant.mjs')).href)
    let seed = 12345
    const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
    let count = 0
    for (let i = 0; i < TRIALS; i++) {
      const terrain = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, k) => {
        const oneway = r() < 0.4
        return { id: 't' + k, type: oneway ? 'oneway' : 'solid', x: Math.floor(r() * 12) * 32, y: Math.floor(r() * 12) * 32,
          w: (1 + Math.floor(r() * 4)) * 32, h: oneway ? 32 : (1 + Math.floor(r() * 3)) * 32, active: true }
      })
      const base = { x: r() * 420 - 10, y: r() * 420 - 10, vx: (r() - 0.5) * 30, vy: (r() - 0.5) * 30, onGround: r() < 0.5, coyote: Math.floor(r() * 7), jumpBuffer: Math.floor(r() * 9) }
      if (r() < 0.5) { const t = terrain[Math.floor(r() * terrain.length)]; base.y = t.y - 42 + (r() * 4 - 1); base.x = t.x + (r() * (t.w + 24) - 12); base.vy = r() * 6 }
      const input = { left: r() < 0.3, right: r() < 0.3, jumpPressed: r() < 0.2 }
      const a = Object.assign(O.createBody(), base), b = Object.assign(M.createBody(), base)
      b.config = { ...a.config }
      const steps = 1 + Math.floor(r() * 4)
      for (let s = 0; s < steps; s++) { O.stepPhysics(a, input, terrain); M.stepPhysics(b, input, terrain) }
      const key = p => JSON.stringify([p.x, p.y, p.vx, p.vy, p.onGround, p.pose, p.coyote, p.jumpBuffer])
      if (key(a) !== key(b)) count++
    }
    return count
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
console.log(`${TRIALS} trials, ${differing} differing steps`)
if (differing) process.exit(1)
