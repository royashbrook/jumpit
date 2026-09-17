import { build } from 'vite'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { releaseIdentity } from './version.mjs'

// Source PNGs and their provenance stay in the repo, never in the installed app.
const STATIC_FILES = [
  '_headers', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'assets/backgrounds/garden-walk.webp', 'assets/backgrounds/region-atlas.webp',
  'assets/backgrounds/final-atlas.webp', 'assets/sprites/courier-sheet.webp',
  'assets/sprites/world-sheet.webp', 'assets/sprites/region-sheet.webp', 'assets/sprites/final-sheet.webp',
]

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(root + '/' + entry.name) : root + '/' + entry.name))).flat().sort()
}

const identity = releaseIdentity(process.cwd(), process.env.RELEASE_BUILD === '1')
const hash = createHash('sha256').update(JSON.stringify(identity))
for (const file of [...await files('src'), ...STATIC_FILES, 'index.html', 'package-lock.json',
  'vite.config.ts', 'svelte.config.js', 'tools/build.mjs', 'tools/version.mjs']) {
  hash.update(file).update(await readFile(file))
}
const id = hash.digest('hex').slice(0, 12)
process.env.JUMPIT_BUILD = id
process.env.JUMPIT_VERSION = identity.version
process.env.JUMPIT_SOURCE = identity.source

await rm('.build-public', { recursive: true, force: true })
for (const file of STATIC_FILES) {
  await mkdir(dirname('.build-public/' + file), { recursive: true })
  await cp(file, '.build-public/' + file)
}
await build()
await writeFile('build/version.json', JSON.stringify({ ...identity, build: id }))
// The shipped v1.5-v1.9 updaters still probe this module to leave their old shell.
await writeFile('build/version.js', '/* Bundled dependency licenses: ./licenses.md */\nexport const VERSION = ' + JSON.stringify(identity.version) + '\n')
const assets = ['./', ...(await files('build')).filter(file => !file.endsWith('/sw.js') && !file.endsWith('/_headers'))
  .map(file => './' + file.slice('build/'.length))]
const worker = await readFile('build/sw.js', 'utf8')
const marker = /(["'`])__PRECACHE_ASSETS__\1/g
if ([...worker.matchAll(marker)].length !== 1) throw new Error('Worker must contain exactly one precache marker')
await writeFile('build/sw.js', worker.replace(marker, JSON.stringify(assets)))
console.log('Built Jumpit ' + identity.version + ' / ' + id + '; ' + assets.length + ' precached paths')
