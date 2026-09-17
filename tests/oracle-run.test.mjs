import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

async function compare(reference, current, expected) {
  const dir = await mkdtemp(join(tmpdir(), 'jumpit-oracle-policy-'))
  try {
    // Execute the unchanged policy runner with controlled recordings, not a reimplemented policy.
    for (const file of ['run.mjs', 'compare.mjs']) await cp(`tools/oracle/${file}`, join(dir, file))
    await writeFile(join(dir, 'reference.mjs'), `
      export const here = ${JSON.stringify(dir)}, repo = here
      export const withReference = fn => fn(repo)
      export const referenceRecording = () => (${JSON.stringify(reference)})
      export const record = () => (${JSON.stringify(current)})
    `)
    await writeFile(join(dir, 'expected-deltas.json'), JSON.stringify(expected))
    const result = spawnSync(process.execPath, [join(dir, 'run.mjs')], { encoding: 'utf8' })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    return { status: result.status, text: result.stdout + result.stderr }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

test('oracle permits only named, actual PWA scalar differences', async () => {
  const old = { pwa: { cacheName: 'old' }, save: { completed: [] } }
  const next = { pwa: { cacheName: null }, save: { completed: [] } }
  const expected = [{ leaf: 'pwa.cacheName', reason: 'compiled worker checked by runtime tests' }]
  assert.equal((await compare(old, next, expected)).status, 0)
  const stale = await compare(old, old, expected)
  assert.equal(stale.status, 1)
  assert.match(stale.text, /stale expected delta/)
  const gameplay = await compare(old, next, [{ leaf: 'save.completed', reason: 'must not be accepted' }])
  assert.equal(gameplay.status, 1)
  assert.match(gameplay.text, /refused expected delta outside pwa/)
})

test('a named PWA allowance cannot suppress a missing or reshaped manifest document', async () => {
  const old = { pwa: { manifest: { id: './', scope: './', name: 'Jumpit' } } }
  const next = { pwa: { manifest: null } }
  for (const [before, after] of [[old, next], [next, old]]) {
    const result = await compare(before, after, [{ leaf: 'pwa.manifest', reason: 'must not exempt a subtree' }])
    assert.equal(result.status, 1)
    assert.match(result.text, /refused expected delta for a container: pwa.manifest/)
  }
})
