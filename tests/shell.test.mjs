import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('v0.0.0 is the package and visible shell version', async () => {
  const pkg = JSON.parse(await text('package.json'))
  const version = await text('version.js')
  assert.equal(pkg.version, '0.0.0')
  assert.match(version, /VERSION = '0\.0\.0'/)
})

test('the house promise is present in readable metadata', async () => {
  const promise = 'no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.'
  const manifest = JSON.parse(await text('manifest.json'))
  assert.ok(manifest.description.includes(promise))
  assert.ok((await text('index.html')).includes(promise))
})

test('the worker keeps navigation network-first and the update probe uncached', async () => {
  const worker = await text('sw.js')
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.match(worker, /fetch\(request\)[\s\S]*caches\.match/)
  assert.match(worker, /searchParams\.has\('update-probe'\)/)
  assert.match(worker, /event\.waitUntil\(store\(request, response\)\)/)
})
