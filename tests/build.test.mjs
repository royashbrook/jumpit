import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import { compactJavaScript } from '../tools/compact-js.mjs'

// npm test builds first. These inspect the bytes that ship, not source templates.
const read = path => readFile(path, 'utf8')
async function files(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(root, prefix + entry.name + '/') : prefix + entry.name))).flat().sort()
}
const shipped = await files('build')
const html = await read('build/index.html')
const identity = JSON.parse(await read('build/version.json'))
const worker = await read('build/sw.js')
const listeners = {}
let shell
vm.runInNewContext(worker, {
  self: { addEventListener: (event, handler) => { listeners[event] = handler }, skipWaiting() {} },
  caches: { open: async () => ({ addAll: async paths => { shell = [...paths] } }) },
})
let installed
listeners.install({ waitUntil: promise => { installed = promise } })
await installed

test('the production artifact is a closed allowlist without test controls or source art', async () => {
  const staticFiles = [
    'assets/backgrounds/final-atlas.webp', 'assets/backgrounds/garden-walk.webp',
    'assets/backgrounds/region-atlas.webp', 'assets/sprites/courier-sheet.webp',
    'assets/sprites/final-sheet.webp', 'assets/sprites/region-sheet.webp', 'assets/sprites/world-sheet.webp',
    'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.json',
    'index.html', 'licenses.md', 'sw.js', 'version.js', 'version.json', '_headers',
  ]
  const generated = shipped.filter(path => /^assets\/app-[\w-]+\.(?:js|css)$/.test(path))
  assert.equal(generated.filter(path => path.endsWith('.js')).length, 1)
  assert.equal(generated.filter(path => path.endsWith('.css')).length, 1)
  assert.deepEqual(shipped, [...staticFiles, ...generated].sort())
  let bytes = 0
  for (const file of shipped) {
    bytes += (await stat(join('build', file))).size
    if (file.endsWith('.js')) {
      const source = await read(join('build', file))
      assert.doesNotMatch(source, /__jumpit(?:Emit|Inputs|Harness)|__jumpitRemount|tests\/harness|__PRECACHE_ASSETS__/)
      assert.match(source, /Bundled dependency licenses: \.\/licenses\.md/)
    }
  }
  assert.ok(bytes <= 3_600_000, 'production build is ' + bytes + ' bytes')
})

test('one source identity binds the page, bundle, worker and legacy version probe', async () => {
  assert.match(identity.version, /^\d+\.\d+\.\d+(?:-dev)?$/)
  assert.match(identity.build, /^[a-f0-9]{12}$/)
  assert.match(identity.source, /^[a-f0-9]{40}$/)
  assert.equal(typeof identity.dirty, 'boolean')
  assert.ok(html.includes(identity.build))
  assert.ok(worker.includes('jumpit-' + identity.build))
  const app = html.match(/src="\.\/(assets\/app-[\w-]+\.js)"/)?.[1]
  const css = html.match(/href="\.\/(assets\/app-[\w-]+\.css)"/)?.[1]
  assert.ok(app && css, 'page names its content-hashed app and style')
  const bundle = await read(join('build', app))
  assert.ok(bundle.includes(identity.version))
  assert.ok(bundle.includes(identity.build))
  const probe = await read('build/version.js')
  assert.match(probe, /export const VERSION = /)
  const exported = await import('data:text/javascript;base64,' + Buffer.from(probe).toString('base64'))
  assert.equal(exported.VERSION, identity.version)
  assert.deepEqual(shell, ['./', ...shipped.filter(path => !['sw.js', '_headers'].includes(path)).map(path => './' + path)])
})

test('the installed runtime licence and original app manifest ship offline', async () => {
  const license = await read('build/licenses.md')
  assert.ok(license.includes((await read('node_modules/svelte/LICENSE.md')).trim()))
  assert.match(html, /rel="license" href="licenses\.md"/)
  assert.ok(shell.includes('./licenses.md'))
  assert.deepEqual(JSON.parse(await read('build/manifest.json')), JSON.parse(await read('manifest.json')))
  assert.match(await read('build/_headers'), /Cache-Control: no-store/)
  assert.match(await read('build/_headers'), /Content-Security-Policy:/)
})

test('release compaction preserves inline and nested multiline template values', async () => {
  const source = 'const inline = `  same  `\nconst nested = `first ${`inner\n  second`}`\nexport { inline, nested }\n'
  const compacted = await compactJavaScript(source, 'fixture.js')
  const encoded = Buffer.from(compacted).toString('base64')
  const fixture = await import(`data:text/javascript;base64,${encoded}`)
  assert.equal(fixture.inline, '  same  ')
  assert.equal(fixture.nested, 'first inner\n  second')
})
