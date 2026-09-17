import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

async function runMutant(t, { pairs = [['"value":1', '"value":2']], mode = 'ok', fixture = '{"value":1}\n' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'jumpit-mutant-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'reference'))
  await Promise.all([
    copyFile(new URL('../tools/oracle/mutants.mjs', import.meta.url), join(root, 'mutants.mjs')),
    copyFile(new URL('../tools/oracle/compare.mjs', import.meta.url), join(root, 'compare.mjs')),
    writeFile(join(root, 'reference/value.json'), fixture),
    writeFile(join(root, 'mutants.json'), JSON.stringify([['fixture', 'value.json', pairs]])),
    writeFile(join(root, 'reference.mjs'), `
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
export const here = dirname(fileURLToPath(import.meta.url))
const read = root => JSON.parse(readFileSync(join(root, 'value.json'), 'utf8'))
export const withReference = fn => fn(join(here, 'reference'))
export const referenceRecording = read
export function record(root) {
  const mode = ${JSON.stringify(mode)}
  if (mode === 'exception') throw new Error('fixture recorder unavailable')
  if (mode === 'nonzero' || mode === 'signal') {
    const command = mode === 'nonzero' ? 'process.exit(23)' : 'process.kill(process.pid, "SIGTERM")'
    const child = spawnSync(process.execPath, ['-e', command], { encoding: 'utf8' })
    if (child.error || child.signal || child.status !== 0) {
      throw new Error('recording failed: status ' + child.status + ', signal ' + (child.signal ?? 'none'))
    }
  }
  return read(root)
}
`),
  ])
  const result = spawnSync(process.execPath, [join(root, 'mutants.mjs')], { cwd: root, encoding: 'utf8' })
  assert.ifError(result.error)
  assert.equal(result.signal, null, result.stderr)
  assert.equal(result.stderr, '')
  return result
}

test('a completed recording with a real differing leaf is caught', async t => {
  const result = await runMutant(t)
  assert.equal(result.status, 0, result.stdout)
  assert.match(result.stdout, /caught\s+fixture\s+1 leaves/)
  assert.match(result.stdout, /caught 1 \/ 1/)
})

test('an exactly anchored no-op is not counted as a caught mutant', async t => {
  const result = await runMutant(t, { pairs: [['"value":1', '"value":1']] })
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /survived\s+fixture/)
  assert.match(result.stdout, /caught 0 \/ 1/)
})

test('a missing mutation anchor refuses the run', async t => {
  const result = await runMutant(t, { pairs: [['"missing":1', '"value":2']] })
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /refused\s+fixture\s+anchor matched 0 times/)
  assert.match(result.stdout, /caught 0 \/ 1/)
})

test('an ambiguous mutation anchor refuses the run', async t => {
  const result = await runMutant(t, { pairs: [[':1', ':2']], fixture: '{"value":1,"other":1}\n' })
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /refused\s+fixture\s+anchor matched 2 times/)
  assert.match(result.stdout, /caught 0 \/ 1/)
})

for (const [mode, detail] of [
  ['exception', /fixture recorder unavailable/],
  ['nonzero', /status 23, signal none/],
  ['signal', /status null, signal SIGTERM/],
]) {
  test(`a recorder ${mode} fails instead of inflating the mutation score`, async t => {
    const result = await runMutant(t, { mode })
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stdout, /failed\s+fixture\s+recorder failed:/)
    assert.match(result.stdout, detail)
    assert.match(result.stdout, /caught 0 \/ 1/)
  })
}
