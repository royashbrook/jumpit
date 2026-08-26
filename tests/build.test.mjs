import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

async function walk(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(relative(join(root, 'build'), path))
  }
  return files.sort()
}

test('the production build is an exact allowlist without test controls', async () => {
  const build = await readFile(new URL('../tools/build.mjs', import.meta.url), 'utf8')
  assert.match(build, /engine\/physics\.js/)
  assert.match(build, /engine\/simulation\.js/)
  assert.doesNotMatch(build, /cp\('assets'/)
  assert.doesNotMatch(build, /tests|solvability|playwright|node_modules/)

  execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root })
  const files = await walk(join(root, 'build'))
  assert.deepEqual(files, [
    'app.css', 'app.js', 'assets/backgrounds/final-atlas.webp',
    'assets/backgrounds/garden-walk.webp', 'assets/backgrounds/region-atlas.webp',
    'assets/sprites/courier-sheet.webp', 'assets/sprites/final-sheet.webp',
    'assets/sprites/region-sheet.webp', 'assets/sprites/world-sheet.webp',
    'audio.js', 'daily.js', 'engine/physics.js', 'engine/simulation.js', 'game.js',
    'icon-180.png', 'icon-192.png',
    'icon-512.png', 'icon-maskable-512.png', 'index.html', 'install.js',
    'levels.js', 'manifest.json', 'release.js', 'save.js', 'seed.js', 'sw.js', 'update.js',
    'version.js',
  ])
  assert.equal(files.some(file => file.startsWith('assets/') && file.endsWith('.png')), false)
  let bytes = 0
  for (const file of files) bytes += (await stat(join(root, 'build', file))).size
  assert.ok(bytes <= 3_600_000, `production build is ${bytes} bytes`)
})
