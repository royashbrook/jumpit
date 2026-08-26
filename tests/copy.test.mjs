import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skip = new Set(['.git', 'build', 'node_modules', 'playwright-report', 'test-results'])

async function publicText(dir = root) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await publicText(path))
    else if (['.html', '.md'].includes(extname(path))) files.push(path)
  }
  return files
}

test('all public copy follows the house voice and honest privacy promise', async () => {
  const problems = []
  for (const file of await publicText()) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, index) => {
      if (line.includes('copy-lint-ok')) return
      if (/—|\s--\s/.test(line)) problems.push(`${file}:${index + 1} em-dash`)
      if (/\bno tracking\b|\bno analytics\b|\bwe do ?n'?o?t track\b/i.test(line)) {
        problems.push(`${file}:${index + 1} false privacy claim`)
      }
    })
  }
  assert.deepEqual(problems, [])
})
