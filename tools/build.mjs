import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

const files = [
  'index.html', 'app.css', 'app.js', 'audio.js', 'daily.js', 'game.js', 'install.js',
  'levels.js', 'manifest.json', 'release.js', 'save.js', 'seed.js', 'sw.js', 'update.js',
  'version.js', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'engine/physics.js', 'engine/simulation.js',
  'assets/backgrounds/garden-walk.webp',
  'assets/backgrounds/region-atlas.webp',
  'assets/backgrounds/final-atlas.webp',
  'assets/sprites/courier-sheet.webp',
  'assets/sprites/world-sheet.webp',
  'assets/sprites/region-sheet.webp',
  'assets/sprites/final-sheet.webp',
]

await rm('build', { recursive: true, force: true })
for (const file of files) {
  await mkdir(dirname(`build/${file}`), { recursive: true })
  await cp(file, `build/${file}`)
}
console.log(`built ${files.length} release files in build/`)
