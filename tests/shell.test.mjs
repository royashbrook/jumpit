import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const index = await text('build/index.html')
const identity = JSON.parse(await text('build/version.json'))
const entry = index.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/)?.[1]
assert.ok(entry, 'the emitted HTML must load a module entry')
const app = await text(`build/${entry}`)
const worker = await text('build/sw.js')

function workerGeneration() {
  const listeners = {}
  vm.runInNewContext(worker, { self: { addEventListener: (type, listener) => { listeners[type] = listener } } })
  let generation
  listeners.message({ data: 'jumpit:generation', ports: [{ postMessage: value => { generation = value } }] })
  return generation
}

test('the emitted shell, compatibility version and worker share one build identity', async () => {
  assert.match(identity.build, /^[a-f0-9]{12}$/)
  assert.match(identity.source, /^[a-f0-9]{40}$/)
  assert.match(index, new RegExp(`<meta name="build" content="${identity.build}">`))
  assert.ok(app.includes(identity.version), 'the compiled shell must use the generated version')
  assert.ok(app.includes(`jumpit-${identity.build}`), 'the updater must acknowledge the emitted worker generation')
  assert.equal(workerGeneration(), `jumpit-${identity.build}`)
  const legacy = await import(`../build/version.js?build=${identity.build}`)
  assert.equal(legacy.VERSION, identity.version)
  assert.match(await text('src/App.svelte'), /id="version"[^>]*>v\{VERSION\}<\/p>/)
})

test('the docs describe the typed architecture and preserve landscape-only release history', async () => {
  const [readme, changelog, roadmap] = await Promise.all([text('README.md'), text('CHANGELOG.md'), text('docs/ROADMAP.md')])
  assert.match(readme, /The v2\.1 architecture/)
  assert.match(readme, /Play at https:\/\/jumpit\.royashbrook\.com\//)
  assert.match(readme, /landscape only by design/)
  assert.doesNotMatch(readme, /Home works upright|release candidate|v1\.9 release/)
  assert.match(changelog, /^## 2\.0\.0: \d{4}-\d{2}-\d{2}$/m)
  assert.doesNotMatch(changelog, /pending human gates/)
  assert.doesNotMatch(roadmap, /portrait Home/)
})

test('the house promise remains in emitted metadata and the compiled MORE footer', async () => {
  const promise = 'no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.'
  const manifest = JSON.parse(await text('build/manifest.json'))
  assert.ok(manifest.description.includes(promise))
  assert.ok(index.includes(promise))
  assert.ok(app.includes(`<p class="ethos">${promise}</p>`), 'the MORE footer carries the full promise, not a paraphrase')
})

test('the compiled shell and README promise the same fixed tap jump', async () => {
  const [shell, readme] = await Promise.all([text('src/App.svelte'), text('README.md')])
  for (const source of [app, shell]) assert.match(source, /Slide left to run\. Tap anywhere on the right side to jump\./)
  assert.match(readme, /tap on the right side to jump/i)
  for (const source of [app, shell, readme]) assert.doesNotMatch(source, /tap or hold the right side to jump/i)
})

test('the emitted manifest keeps the installed app identity and separate maskable icon', async () => {
  const manifest = JSON.parse(await text('build/manifest.json'))
  assert.deepEqual(manifest, JSON.parse(await text('manifest.json')))
  const any = manifest.icons.filter(icon => icon.purpose === 'any')
  const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable')
  assert.equal(manifest.id, './')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.orientation, 'landscape')
  assert.ok(any.length >= 2)
  assert.equal(maskable.length, 1)
  assert.ok(!any.some(icon => icon.src === maskable[0].src))
  for (const icon of manifest.icons) assert.ok((await readFile(new URL(`../build/${icon.src}`, import.meta.url))).length > 0)
  assert.match(index, /<link rel="manifest" href="\.\/manifest\.json">/)
  assert.match(index, /<link rel="apple-touch-icon" href="\.\/icon-180\.png">/)
})

test('the real HTML loads the Svelte mount and hashed local script and stylesheet', async () => {
  assert.match(index, /<div id="app"><\/div>/)
  assert.match(entry, /^\.\/assets\/[\w-]+-[\w-]+\.js$/)
  const stylesheet = index.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1]
  assert.match(stylesheet, /^\.\/assets\/[\w-]+-[\w-]+\.css$/)
  assert.ok((await text(`build/${stylesheet}`)).length > 0)
  assert.doesNotMatch(index, /\/src\/|app\.(?:js|css)\?v=/)
  for (const id of ['menu', 'game', 'stage', 'pause', 'howto', 'about', 'rotate-device', 'update', 'version']) {
    assert.ok(app.includes(`id="${id}"`), `the compiled shell is missing ${id}`)
  }
})

test('the hashed module graph cannot collide with an installed r12 cache-first controller', async () => {
  const r12 = new Set(['app.js?v=10', 'app.css?v=9', 'game.js?v=8', 'levels.js', 'save.js', 'engine/physics.js', 'engine/simulation.js'])
  const base = new URL('https://jumpit.test/jumpit/')
  const pending = [new URL(entry, base)]
  const seen = new Set()
  while (pending.length) {
    const url = pending.pop()
    if (seen.has(url.href)) continue
    seen.add(url.href)
    assert.equal(url.origin, base.origin)
    assert.equal(url.search, '', 'module freshness must not depend on hand-maintained query strings')
    assert.ok(url.pathname.startsWith(`${base.pathname}assets/`))
    const path = url.pathname.slice(base.pathname.length)
    assert.match(path, /^assets\/[\w-]+-[\w-]+\.js$/)
    assert.equal(r12.has(path), false, `r12 can serve stale ${path}`)
    const module = await text(`build/${path}`)
    assert.ok(worker.includes(JSON.stringify(`./${path}`)), `${path} must be precached`)
    for (const [, , specifier] of module.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"`])([^'"`]+)\1/g)) {
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `module dependency is not a local relative URL: ${specifier}`)
      pending.push(new URL(specifier, url))
    }
  }
  const emittedModules = (await readdir(new URL('../build/assets/', import.meta.url))).filter(path => path.endsWith('.js'))
  assert.deepEqual([...seen].sort(), emittedModules.map(path => new URL(`assets/${path}`, base).href).sort())
  // Cache cleanup and cache-first navigation policy are exercised as emitted events in worker.test.mjs.
})
