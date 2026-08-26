import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

const files = [
  'index.html', 'app.css', 'app.js', 'audio.js', 'game.js', 'install.js',
  'levels.js', 'manifest.json', 'release.js', 'save.js', 'seed.js', 'sw.js', 'update.js',
  'version.js', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'engine/physics.js',
  'assets/backgrounds/garden-walk.png',
  'assets/backgrounds/region-atlas.png',
  'assets/sprites/courier-sheet.png',
  'assets/sprites/world-sheet.png',
  'assets/sprites/region-sheet.png',
]

await rm('build', { recursive: true, force: true })
for (const file of files) {
  await mkdir(dirname(`build/${file}`), { recursive: true })
  await cp(file, `build/${file}`)
}
console.log(`built ${files.length} release files in build/`)
