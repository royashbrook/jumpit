import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('generated art has a complete, hash-verified provenance manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/manifest.json', root), 'utf8'))
  assert.equal(manifest.schema, 1)
  assert.ok(manifest.assets.length >= 3)
  for (const asset of manifest.assets) {
    assert.match(asset.file, /^assets\//)
    assert.ok(asset.prompt.length > 30)
    assert.equal(asset.license, 'project-original')
    const bytes = await readFile(new URL(asset.file, root))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file)
  }
})
