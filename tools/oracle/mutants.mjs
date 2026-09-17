// Prove the oracle detects change: apply each mutant to a copy of the reference release, record it,
// and require at least one leaf to differ. A mutant whose anchor does not match exactly once is
// refused and fails the run, so a silent no-op can never count as detected. Recorder failures also
// fail the run: only a completed recording with differing leaves counts as a caught mutant.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffRecordings } from './compare.mjs'
import { here, record, referenceRecording, withReference } from './reference.mjs'

const mutants = JSON.parse(readFileSync(join(here, 'mutants.json'), 'utf8'))
const results = withReference(ref => {
  const reference = referenceRecording(ref)
  return mutants.map(entry => {
    const [name, file] = entry
    const pairs = Array.isArray(entry[2]) ? entry[2] : [[entry[2], entry[3]]]
    const copy = mkdtempSync(join(tmpdir(), 'jumpit-oracle-mut-'))
    try {
      cpSync(ref, copy, { recursive: true, filter: src => !src.includes('node_modules') && !src.endsWith('.git') })
      const path = join(copy, file)
      let text = readFileSync(path, 'utf8')
      for (const [from, to] of pairs) {
        const count = text.split(from).length - 1
        if (count !== 1) return { name, status: 'refused', detail: `anchor matched ${count} times` }
        text = text.replace(from, to)
      }
      writeFileSync(path, text)
      let recording
      try { recording = record(copy) } catch (error) {
        return { name, status: 'failed', detail: `recorder failed: ${error?.message ?? error}` }
      }
      const diffs = diffRecordings(reference, recording)
      return diffs.length ? { name, status: 'caught', detail: `${diffs.length} leaves` } : { name, status: 'survived', detail: '' }
    } finally {
      rmSync(copy, { recursive: true, force: true })
    }
  })
})
for (const r of results) console.log(`${r.status.padEnd(8)} ${r.name}${r.detail ? `  ${r.detail}` : ''}`)
const caught = results.filter(r => r.status === 'caught').length
console.log(`caught ${caught} / ${results.length}`)
if (caught !== results.length) process.exit(1)
