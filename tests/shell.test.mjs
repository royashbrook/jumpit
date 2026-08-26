import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('v1.9.0 is the package and visible shell version', async () => {
  const pkg = JSON.parse(await text('package.json'))
  const version = await text('version.js')
  assert.equal(pkg.version, '1.9.0')
  assert.match(version, /VERSION = '1\.9\.0'/)
})

test('the house promise is present in readable metadata', async () => {
  const promise = 'no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.'
  const manifest = JSON.parse(await text('manifest.json'))
  assert.ok(manifest.description.includes(promise))
  assert.ok((await text('index.html')).includes(promise))
})

test('the manifest has a stable app identity and a separate maskable icon', async () => {
  const manifest = JSON.parse(await text('manifest.json'))
  const any = manifest.icons.filter(icon => icon.purpose === 'any')
  const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable')
  assert.equal(manifest.id, './')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.ok(any.length >= 2)
  assert.equal(maskable.length, 1)
  assert.ok(!any.some(icon => icon.src === maskable[0].src))
})

test('the worker keeps navigation network-first and the update probe uncached', async () => {
  const worker = await text('sw.js')
  assert.match(worker, /const CACHE = 'jumpit-v1\.9\.0'/)
  assert.match(worker, /cache\.addAll\(SHELL\)/)
  assert.doesNotMatch(worker, /cache\.add\(url\)\.catch/)
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.match(worker, /fetch\(request\)[\s\S]*caches\.match/)
  assert.match(worker, /searchParams\.has\('update-probe'\)/)
  assert.match(worker, /event\.waitUntil\(store\(request, response\)\)/)
})

test('the worker removes only old Jumpit caches', async () => {
  const source = await text('sw.js')
  const listeners = {}
  const deleted = []
  const sandbox = {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting() {},
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
    },
    caches: {
      keys: async () => ['jumpit-v0.9.0', 'jumpit-v1.5.0', 'jumpit-v1.8.0', 'jumpit-v1.9.0', 'sibling-game-v4'],
      delete: async key => { deleted.push(key) },
    },
    URL,
  }
  vm.runInNewContext(source, sandbox)
  let done
  listeners.activate({ waitUntil: promise => { done = promise } })
  await done
  assert.deepEqual(deleted, ['jumpit-v0.9.0', 'jumpit-v1.5.0', 'jumpit-v1.8.0'])
})
