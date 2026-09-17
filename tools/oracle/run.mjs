// Compare the current tree with the reference release, leaf by leaf.
// Differences are allowed only when named in expected-deltas.json with a reason, and only for
// installed-app identity (pwa.*). Gameplay, content, save and audio leaves can never be listed there.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diffRecordings } from './compare.mjs'
import { here, record, referenceRecording, repo, withReference } from './reference.mjs'

const expected = JSON.parse(readFileSync(join(here, 'expected-deltas.json'), 'utf8'))
const problems = []
for (const entry of expected) {
  if (typeof entry?.leaf !== 'string' || !entry.leaf.startsWith('pwa.')) problems.push(`refused expected delta outside pwa.*: ${JSON.stringify(entry)}`)
  if (typeof entry?.reason !== 'string' || !entry.reason.trim()) problems.push(`expected delta without a reason: ${JSON.stringify(entry)}`)
}
if (problems.length) { for (const p of problems) console.log(p); process.exit(1) }

const reference = withReference(dir => referenceRecording(dir))
const current = record(repo, join(here, 'paths.json'))
// An allowance names a scalar leaf, never an entire document that could vanish or change shape.
for (const entry of expected) {
  for (const recording of [reference, current]) {
    const value = entry.leaf.split('.').reduce((value, key) => value?.[key], recording)
    if (value !== null && typeof value === 'object') {
      throw new Error(`refused expected delta for a container: ${entry.leaf}`)
    }
  }
}
const diffs = diffRecordings(reference, current)
const allowed = new Set(expected.map(e => e.leaf))
const unexpected = diffs.filter(d => !allowed.has(d))
const stale = expected.filter(e => !diffs.includes(e.leaf))

for (const e of expected.filter(e => diffs.includes(e.leaf))) console.log(`named delta  ${e.leaf}: ${e.reason}`)
for (const e of stale) console.log(`stale expected delta, no longer differs: ${e.leaf}`)
if (unexpected.length) {
  const bySection = {}
  for (const d of unexpected) (bySection[d.split('.')[0]] ||= []).push(d)
  for (const [s, d] of Object.entries(bySection)) console.log(`${s}: ${d.length} unexpected leaves, first: ${d.slice(0, 4).join(' | ')}`)
}
if (unexpected.length || stale.length) { console.log(`oracle FAILED: ${unexpected.length} unexpected, ${stale.length} stale`); process.exit(1) }
console.log(`oracle passed: ${diffs.length} named deltas, every other leaf identical to the reference`)
