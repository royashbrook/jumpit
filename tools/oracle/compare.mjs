// Leaf-by-leaf comparison of two oracle recordings. The meta section is ignored.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function diffRecordings(a, b) {
  const diffs = []
  const walk = (x, y, path) => {
    if (path[0] === 'meta') return
    if (x && typeof x === 'object' && y && typeof y === 'object') {
      if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(path.join('.')); return }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], [...path, k])
      return
    }
    if (!Object.is(x, y) && JSON.stringify(x) !== JSON.stringify(y)) diffs.push(path.join('.'))
  }
  walk(a, b, [])
  return diffs
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')))
  const diffs = diffRecordings(a, b)
  if (!diffs.length) { console.log('identical across every recorded leaf'); process.exit(0) }
  const bySection = {}
  for (const d of diffs) (bySection[d.split('.')[0]] ||= []).push(d)
  for (const [s, d] of Object.entries(bySection)) console.log(`${s}: ${d.length} leaves differ, first: ${d.slice(0, 4).join(' | ')}`)
  console.log(`${diffs.length} differing leaves`)
  process.exit(1)
}
