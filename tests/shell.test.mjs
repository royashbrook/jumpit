import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('v2.0.0 is the package and visible shell version', async () => {
  const pkg = JSON.parse(await text('package.json'))
  const version = await text('version.js')
  assert.equal(pkg.version, '2.0.0')
  assert.match(version, /VERSION = '2\.0\.0'/)
})

test('the house promise is present in readable metadata', async () => {
  const promise = 'no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.'
  const manifest = JSON.parse(await text('manifest.json'))
  assert.ok(manifest.description.includes(promise))
  assert.ok((await text('index.html')).includes(promise))
})

test('the shell and README promise the same fixed tap jump', async () => {
  const [app, index, readme] = await Promise.all([text('app.js'), text('index.html'), text('README.md')])
  assert.match(app, /Slide left to run\. Tap anywhere on the right side to jump\./)
  assert.match(index, /Slide left to run\. Tap anywhere on the right side to jump\./)
  assert.match(readme, /tap on the right side to jump/i)
  for (const source of [app, index, readme]) assert.doesNotMatch(source, /tap or hold the right side to jump/i)
})

test('the manifest has a stable app identity and a separate maskable icon', async () => {
  const manifest = JSON.parse(await text('manifest.json'))
  const any = manifest.icons.filter(icon => icon.purpose === 'any')
  const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable')
  assert.equal(manifest.id, './')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.orientation, 'landscape')
  assert.ok(any.length >= 2)
  assert.equal(maskable.length, 1)
  assert.ok(!any.some(icon => icon.src === maskable[0].src))
})

test('the worker keeps navigation network-first and the update probe uncached', async () => {
  const worker = await text('sw.js')
  assert.match(worker, /const CACHE = 'jumpit-v2\.0\.0-r14'/)
  assert.match(await text('index.html'), /app\.css\?v=10[\s\S]*app\.js\?v=12/)
  assert.match(await text('app.js'), /game\.js\?v=10[\s\S]*levels\.js\?v=2[\s\S]*save\.js\?v=2[\s\S]*update\.js\?v=4/)
  assert.match(await text('game.js'), /levels\.js\?v=2[\s\S]*simulation\.js\?v=2/)
  assert.match(await text('engine/simulation.js'), /physics\.js\?v=2[\s\S]*levels\.js\?v=2/)
  assert.match(await text('save.js'), /levels\.js\?v=2/)
  assert.match(worker, /cache\.addAll\(SHELL\)/)
  assert.doesNotMatch(worker, /cache\.add\(url\)\.catch/)
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.match(worker, /fetch\(request\)[\s\S]*caches\.match/)
  assert.match(worker, /searchParams\.has\('update-probe'\)/)
  assert.match(worker, /event\.waitUntil\(store\(request, response\)\)/)
})

test('an exact r12 cache-first controller cannot mix old gameplay into the r14 shell', async () => {
  const [index, app, game, simulation, save, worker] = await Promise.all([
    text('index.html'), text('app.js'), text('game.js'), text('engine/simulation.js'), text('save.js'), text('sw.js'),
  ])
  const resolveImports = (source, base) => [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(([, specifier]) => {
    const url = new URL(specifier, `https://jumpit.test/${base}`)
    return `${url.pathname.slice(1)}${url.search}`
  })
  const entry = index.match(/src="([^"]*app\.js\?v=\d+)"/)?.[1]
  const changedPaths = new Set(['app.js', 'game.js', 'levels.js', 'save.js', 'engine/physics.js', 'engine/simulation.js'])
  const current = new Set([
    entry,
    ...resolveImports(app, 'app.js'),
    ...resolveImports(game, 'game.js'),
    ...resolveImports(simulation, 'engine/simulation.js'),
    ...resolveImports(save, 'save.js'),
  ].filter(url => changedPaths.has(url?.split('?')[0])))
  const r12 = new Map([
    ['app.js?v=10', 'old'], ['game.js?v=8', 'old'], ['levels.js', 'old'], ['save.js', 'old'],
    ['engine/physics.js', 'old'], ['engine/simulation.js', 'old'],
  ])

  assert.deepEqual([...current].sort(), [
    'app.js?v=12', 'engine/physics.js?v=2', 'engine/simulation.js?v=2',
    'game.js?v=10', 'levels.js?v=2', 'save.js?v=2',
  ])
  for (const url of current) {
    assert.equal(r12.has(url), false, `r12 can serve stale ${url}`)
    assert.match(worker, new RegExp(`['"]\\./${url.replace(/[.?]/g, '\\$&')}['"]`), `r14 does not precache ${url}`)
  }

  // If r14 claims before app code attaches controllerchange, no reload fires.
  // Every changed module must therefore already be current through the r12 cache-first controller.
  const served = [...current].map(url => r12.get(url) || 'current')
  assert.deepEqual(new Set(served), new Set(['current']))
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
      keys: async () => ['jumpit-v0.9.0', 'jumpit-v1.5.0', 'jumpit-v1.8.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7', 'jumpit-v2.0.0-r8', 'jumpit-v2.0.0-r9', 'jumpit-v2.0.0-r10', 'jumpit-v2.0.0-r11', 'jumpit-v2.0.0-r12', 'jumpit-v2.0.0-r13', 'sibling-game-v4'],
      delete: async key => { deleted.push(key) },
    },
    URL,
  }
  vm.runInNewContext(source, sandbox)
  let done
  listeners.activate({ waitUntil: promise => { done = promise } })
  await done
  assert.deepEqual(deleted, ['jumpit-v0.9.0', 'jumpit-v1.5.0', 'jumpit-v1.8.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7', 'jumpit-v2.0.0-r8', 'jumpit-v2.0.0-r9', 'jumpit-v2.0.0-r10', 'jumpit-v2.0.0-r11', 'jumpit-v2.0.0-r12', 'jumpit-v2.0.0-r13'])
})
