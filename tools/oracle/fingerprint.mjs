// Diagnostic only, never an alternative passing gate. Print IEEE-754 math bits and reference
// subtree hashes to locate platform drift without rounding or accepting a new baseline.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [checkout, recorder] = process.argv.slice(2).map(p => resolve(p))
const REFERENCE = '25abd61230184517c85a7b5f381ad25988c81989'
const bits = x => {
  const d = new DataView(new ArrayBuffer(8))
  d.setFloat64(0, x)
  return Array.from(new Uint8Array(d.buffer), b => b.toString(16).padStart(2, '0')).join('')
}
console.log(`platform ${process.platform} ${process.arch} node ${process.version} v8 ${process.versions.v8}`)
const probes = []
for (const f of [0, 1, 7, 100, 999, 4321]) for (const phase of [0, 0.7, 2.1]) probes.push([`sin(${f}*.025+${phase})`, Math.sin(f * 0.025 + phase)])
for (const f of [0, 13, 250]) for (const home of [48, 1234.5]) probes.push([`sin(${f}*.08+${home})`, Math.sin(f * 0.08 + home)])
for (const n of [-17, -12, -5, 0, 2, 7, 12, 14]) probes.push([`2**((${n}-9)/12)*440`, 440 * 2 ** ((n - 9) / 12)])
for (const t of [0.0001, 0.2, 1.3]) probes.push([`sin(2pi*261.6*${t})`, Math.sin(Math.PI * 2 * 261.6255653005986 * t)])
probes.push(['cos(0.3)', Math.cos(0.3)], ['exp(-1.7)', Math.exp(-1.7)], ['pow(0.74,14)', Math.pow(0.74, 14)], ['sqrt(2)', Math.sqrt(2)])
for (const [name, v] of probes) console.log(`math ${name.padEnd(28)} ${bits(v)}`)

const dir = mkdtempSync(join(tmpdir(), 'oracle-diag-'))
try {
  execFileSync('git', ['-C', checkout, 'worktree', 'add', '--detach', join(dir, 'ref'), REFERENCE], { stdio: 'pipe' })
  const out = join(dir, 'rec.json')
  const result = spawnSync(process.execPath, [recorder, join(dir, 'ref'), out], { encoding: 'utf8' })
  if (result.error || result.signal || result.status !== 0) throw new Error(`recorder failed: ${result.status}, ${result.signal ?? 'no signal'}\n${result.error?.message ?? ''}${result.stderr}`)
  const recording = JSON.parse(readFileSync(out, 'utf8'))
  delete recording.meta
  const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
  console.log(`tree . ${createHash('sha256').update(JSON.stringify(recording)).digest('hex')}`)
  const walk = (value, path, depth) => {
    if (!value || typeof value !== 'object') return
    for (const key of Object.keys(value)) {
      const child = path ? `${path}.${key}` : key
      console.log(`tree ${child} ${sha(value[key])}`)
      if (depth < 3 && !(Array.isArray(value[key]) && value[key].length > 12)) walk(value[key], child, depth + 1)
    }
  }
  walk(recording, '', 1)
} finally {
  try { execFileSync('git', ['-C', checkout, 'worktree', 'remove', '--force', join(dir, 'ref')], { stdio: 'pipe' }) } catch {}
  rmSync(dir, { recursive: true, force: true })
}
